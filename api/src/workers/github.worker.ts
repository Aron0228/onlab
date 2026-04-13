import * as dotenv from 'dotenv';
import {DataObject} from '@loopback/repository';
import {Job, Worker} from 'bullmq';
import {RestApi} from '../application';
import {
  User,
  GithubIssue,
  GithubLabel,
  GithubPullRequest,
  GithubRepository,
  GithubRepositoryWithRelations,
  UserExpertiseAssocWithRelations,
  Workspace,
  WorkspaceMemberWithRelations,
} from '../models';
import {
  GithubRepositoryRepository,
  UserRepository,
  UserExpertiseAssocRepository,
  WorkspaceMemberRepository,
  WorkspaceRepository,
} from '../repositories';
import {
  CREATE_GITHUB_ISSUE_JOB_NAME,
  type CreateGithubIssueJobData,
  GITHUB_ISSUES_QUEUE_NAME,
  GithubService,
  type GithubIssuesJobData,
  IssuePriorityService,
  IssueService,
  LabelService,
  PRIORITIZE_GITHUB_PULL_REQUEST_JOB_NAME,
  type PrioritizeGithubPullRequestJobData,
  type PullRequestReviewerExpertiseSuggestion,
  PullRequestMergeRiskService,
  PullRequestService,
  RedisService,
  SYNC_GITHUB_LABELS_JOB_NAME,
  SyncGithubIssuesJobData,
} from '../services';

dotenv.config();

const ISSUE_BATCH_SIZE = 100;
const MIN_PULL_REQUEST_PROCESSING_REACTION_MS = 2000;

async function startWorker() {
  const app = new RestApi();
  await app.boot();

  const redisService = await app.get<RedisService>('services.RedisService');
  const githubService = await app.get<GithubService>('services.GithubService');
  const issueService = await app.get<IssueService>('services.IssueService');
  const issuePriorityService = await app.get<IssuePriorityService>(
    'services.IssuePriorityService',
  );
  const labelService = await app.get<LabelService>('services.LabelService');
  const pullRequestMergeRiskService =
    await app.get<PullRequestMergeRiskService>(
      'services.PullRequestMergeRiskService',
    );
  const pullRequestService = await app.get<PullRequestService>(
    'services.PullRequestService',
  );
  const githubRepositoryRepository = await app.get<GithubRepositoryRepository>(
    'repositories.GithubRepositoryRepository',
  );
  const userRepository = await app.get<UserRepository>(
    'repositories.UserRepository',
  );
  const workspaceMemberRepository = await app.get<WorkspaceMemberRepository>(
    'repositories.WorkspaceMemberRepository',
  );
  const userExpertiseAssocRepository =
    await app.get<UserExpertiseAssocRepository>(
      'repositories.UserExpertiseAssocRepository',
    );
  const workspaceRepository = await app.get<WorkspaceRepository>(
    'repositories.WorkspaceRepository',
  );

  const worker = new Worker<GithubIssuesJobData>(
    GITHUB_ISSUES_QUEUE_NAME,
    async job => {
      if (job.name === SYNC_GITHUB_LABELS_JOB_NAME) {
        await processSyncLabelsJob(
          job as Job<SyncGithubIssuesJobData>,
          githubService,
          githubRepositoryRepository,
          labelService,
        );
        return;
      }

      if (job.name === CREATE_GITHUB_ISSUE_JOB_NAME) {
        await processCreateIssueJob(
          job as Job<CreateGithubIssueJobData>,
          githubService,
          githubRepositoryRepository,
          workspaceRepository,
          issuePriorityService,
          issueService,
          labelService,
        );
        return;
      }

      if (job.name === PRIORITIZE_GITHUB_PULL_REQUEST_JOB_NAME) {
        await processPrioritizePullRequestJob(
          job as Job<PrioritizeGithubPullRequestJobData>,
          githubService,
          githubRepositoryRepository,
          issuePriorityService,
          pullRequestMergeRiskService,
          pullRequestService,
          userRepository,
          workspaceRepository,
          workspaceMemberRepository,
          userExpertiseAssocRepository,
        );
        return;
      }

      await processSyncIssuesJob(
        job as Job<SyncGithubIssuesJobData>,
        githubService,
        githubRepositoryRepository,
        workspaceRepository,
        issuePriorityService,
        issueService,
        labelService,
        pullRequestMergeRiskService,
        pullRequestService,
        userRepository,
        workspaceMemberRepository,
        userExpertiseAssocRepository,
      );
    },
    {
      connection: redisService.getConnectionOptions(),
    },
  );

  worker.on('completed', job => {
    const metadata = getJobMetadata(job.data);

    console.log('GitHub sync job completed', {
      jobName: job.name,
      jobId: job.id,
      ...metadata,
    });
  });

  worker.on('failed', (job, error) => {
    const metadata = job ? getJobMetadata(job.data) : {};

    console.error('GitHub sync job failed', {
      jobName: job?.name,
      jobId: job?.id,
      ...metadata,
      error,
    });
  });

  const shutdown = async () => {
    await worker.close();
    await redisService.close();
    await app.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log('GitHub issues worker started');
}

async function processSyncIssuesJob(
  job: Job<SyncGithubIssuesJobData>,
  githubService: GithubService,
  githubRepositoryRepository: GithubRepositoryRepository,
  workspaceRepository: WorkspaceRepository,
  issuePriorityService: IssuePriorityService,
  issueService: IssueService,
  labelService: LabelService,
  pullRequestMergeRiskService: PullRequestMergeRiskService,
  pullRequestService: PullRequestService,
  userRepository: UserRepository,
  workspaceMemberRepository: WorkspaceMemberRepository,
  userExpertiseAssocRepository: UserExpertiseAssocRepository,
) {
  const repositories = await githubRepositoryRepository.find({
    where: {workspaceId: job.data.workspaceId},
  });

  for (const repository of repositories) {
    await syncRepositoryIssues(
      repository,
      job.data.installationId,
      githubService,
      issuePriorityService,
      issueService,
    );
  }

  await workspaceRepository.updateById(job.data.workspaceId, {
    issueSyncDone: true,
  });

  for (const repository of repositories) {
    await syncRepositoryPullRequests(
      repository,
      job.data.installationId,
      githubService,
      issuePriorityService,
      labelService,
      pullRequestMergeRiskService,
      pullRequestService,
      userRepository,
      workspaceRepository,
      workspaceMemberRepository,
      userExpertiseAssocRepository,
    );
  }

  await workspaceRepository.updateById(job.data.workspaceId, {
    prSyncDone: true,
  });
}

async function processSyncLabelsJob(
  job: Job<SyncGithubIssuesJobData>,
  githubService: GithubService,
  githubRepositoryRepository: GithubRepositoryRepository,
  labelService: LabelService,
) {
  const repositories = await githubRepositoryRepository.find({
    where: {workspaceId: job.data.workspaceId},
  });

  for (const repository of repositories) {
    await syncRepositoryLabels(
      repository,
      job.data.installationId,
      githubService,
      labelService,
    );
  }
}

async function processCreateIssueJob(
  job: Job<CreateGithubIssueJobData>,
  githubService: GithubService,
  githubRepositoryRepository: GithubRepositoryRepository,
  workspaceRepository: WorkspaceRepository,
  issuePriorityService: IssuePriorityService,
  issueService: IssueService,
  labelService: LabelService,
) {
  const repository = await githubRepositoryRepository.findById(
    job.data.repositoryId,
  );
  const workspace = await workspaceRepository.findById(repository.workspaceId);
  const installationId = Number(workspace.githubInstallationId);

  if (!workspace.githubInstallationId || Number.isNaN(installationId)) {
    throw new Error('Workspace is not connected to a GitHub installation');
  }

  await syncRepositoryLabels(
    repository,
    installationId,
    githubService,
    labelService,
  );

  const prediction = await issuePriorityService.predictIssuePriority({
    title: job.data.title,
    description: job.data.description,
  });
  const githubIssue = await githubService.createIssue(
    installationId,
    repository.fullName,
    job.data.title,
    issuePriorityService.upsertPredictionNote(job.data.description, prediction),
  );

  await githubService.applyPriorityPredictionToIssue(
    installationId,
    repository.fullName,
    githubIssue.number,
    prediction,
    job.data.description,
  );

  await issueService.upsertIssue(
    mapIssueToModel(
      repository.id,
      githubIssue,
      issuePriorityService.sanitizeIssueDescription(job.data.description),
    ),
    {
      repositoryId: repository.id,
      githubId: githubIssue.id,
    },
    prediction,
  );
}

async function processPrioritizePullRequestJob(
  job: Job<PrioritizeGithubPullRequestJobData>,
  githubService: GithubService,
  githubRepositoryRepository: GithubRepositoryRepository,
  issuePriorityService: IssuePriorityService,
  pullRequestMergeRiskService: PullRequestMergeRiskService,
  pullRequestService: PullRequestService,
  userRepository: UserRepository,
  workspaceRepository: WorkspaceRepository,
  workspaceMemberRepository: WorkspaceMemberRepository,
  userExpertiseAssocRepository: UserExpertiseAssocRepository,
) {
  const processingStartedAt = Date.now();
  const repository = await githubRepositoryRepository.findOne({
    where: {
      id: job.data.repositoryId,
      fullName: job.data.repositoryFullName,
    },
    include: [{relation: 'workspace'}],
  });
  const workspace =
    (repository as GithubRepositoryWithRelations | null)?.workspace ?? null;
  const reviewerSuggestionCandidates = workspace
    ? await buildPullRequestReviewerSuggestionCandidates({
        workspace,
        authorGithubId: job.data.authorGithubId ?? null,
        userRepository,
        workspaceMemberRepository,
        userExpertiseAssocRepository,
      }).catch(() => [])
    : [];
  const reviewerExpertiseCandidates =
    buildPullRequestReviewerExpertiseCandidates(reviewerSuggestionCandidates);

  console.log('Pull request reviewer suggestion candidates prepared', {
    workspaceId: workspace?.id ?? null,
    workspaceName: workspace?.name ?? null,
    repositoryFullName: job.data.repositoryFullName,
    pullRequestNumber: job.data.pullRequestNumber,
    reviewerSuggestionCandidateCount: reviewerSuggestionCandidates.length,
    reviewerSuggestionCandidates: reviewerSuggestionCandidates.map(
      candidate => ({
        userId: candidate.userId,
        username: candidate.username,
        workspaceRole: candidate.workspaceRole,
        expertises: candidate.expertises.map(expertise => expertise.name),
      }),
    ),
    reviewerExpertiseCandidateCount: reviewerExpertiseCandidates.length,
    reviewerExpertiseCandidates: reviewerExpertiseCandidates.map(candidate => ({
      name: candidate.name,
      description: candidate.description ?? null,
    })),
  });

  await githubService.syncRepositoryLabels(
    job.data.installationId,
    job.data.repositoryFullName,
  );

  const processingReactionId = await githubService.markPullRequestAsProcessing(
    job.data.installationId,
    job.data.repositoryFullName,
    job.data.pullRequestNumber,
  );
  console.log('Pull request processing reaction added', {
    repositoryFullName: job.data.repositoryFullName,
    pullRequestNumber: job.data.pullRequestNumber,
    reactionId: processingReactionId,
  });
  const description = issuePriorityService.sanitizeIssueDescription(
    job.data.description,
  );
  const prediction = await pullRequestMergeRiskService.predictMergeRisk({
    installationId: job.data.installationId,
    repositoryFullName: job.data.repositoryFullName,
    pullRequestNumber: job.data.pullRequestNumber,
    title: job.data.title,
    description,
    reviewerExpertiseCandidates,
  });
  const resolvedReviewerSuggestions = resolveReviewerSuggestionsFromExpertise(
    prediction.reviewerExpertiseSuggestions,
    reviewerSuggestionCandidates,
  );
  console.log('Pull request reviewer suggestions resolved from expertise', {
    workspaceId: workspace?.id ?? null,
    repositoryFullName: job.data.repositoryFullName,
    pullRequestNumber: job.data.pullRequestNumber,
    reviewerExpertiseSuggestions: prediction.reviewerExpertiseSuggestions,
    resolvedReviewerSuggestions,
  });

  try {
    await githubService.syncPullRequestReviewComments(
      job.data.installationId,
      job.data.repositoryFullName,
      job.data.pullRequestNumber,
      prediction.findings,
    );
  } catch (error) {
    console.warn('Pull request AI review comment sync failed', {
      repositoryFullName: job.data.repositoryFullName,
      pullRequestNumber: job.data.pullRequestNumber,
      error,
    });
  }

  if (workspace && workspace.reviewerSuggestionSync !== false) {
    console.log('Pull request reviewer sync gate passed', {
      workspaceId: workspace.id,
      repositoryFullName: job.data.repositoryFullName,
      pullRequestNumber: job.data.pullRequestNumber,
      reviewerSuggestionSync: workspace.reviewerSuggestionSync,
      resolvedReviewerUsernames: resolvedReviewerSuggestions.map(
        suggestion => suggestion.username,
      ),
    });
    try {
      await githubService.syncPullRequestReviewerSuggestionComment(
        job.data.installationId,
        job.data.repositoryFullName,
        job.data.pullRequestNumber,
        resolvedReviewerSuggestions.map(suggestion => ({
          username: suggestion.username,
          reason: suggestion.reason,
        })),
      );
      await githubService.requestPullRequestReviewers(
        job.data.installationId,
        job.data.repositoryFullName,
        job.data.pullRequestNumber,
        resolvedReviewerSuggestions.map(suggestion => suggestion.username),
      );
    } catch (error) {
      console.warn('Pull request reviewer suggestion sync failed', {
        repositoryFullName: job.data.repositoryFullName,
        pullRequestNumber: job.data.pullRequestNumber,
        error,
      });
    }
  } else {
    console.log('Pull request reviewer sync gate skipped', {
      workspaceId: workspace?.id ?? null,
      repositoryFullName: job.data.repositoryFullName,
      pullRequestNumber: job.data.pullRequestNumber,
      reviewerSuggestionSync: workspace?.reviewerSuggestionSync ?? null,
      resolvedReviewerUsernames: resolvedReviewerSuggestions.map(
        suggestion => suggestion.username,
      ),
    });
  }

  await ensureMinimumProcessingReactionDuration(processingStartedAt);
  await githubService.applyMergeRiskPredictionToPullRequest(
    job.data.installationId,
    job.data.repositoryFullName,
    job.data.pullRequestNumber,
    prediction,
    description,
    processingReactionId,
  );

  const author = job.data.authorGithubId
    ? await userRepository.findOne({
        where: {githubId: job.data.authorGithubId},
      })
    : null;
  const existingPullRequest = await pullRequestService.findOne({
    repositoryId: job.data.repositoryId,
    githubPrNumber: job.data.pullRequestNumber,
  });
  const nextStatus = resolveQueuedPullRequestStatus(
    job.data.status,
    existingPullRequest?.status,
  );

  await pullRequestService.upsertPullRequest(
    {
      repositoryId: job.data.repositoryId,
      githubPrNumber: job.data.pullRequestNumber,
      title: job.data.title,
      status: nextStatus,
      description,
      authorId: author?.id ?? null,
    },
    {
      repositoryId: job.data.repositoryId,
      githubPrNumber: job.data.pullRequestNumber,
    },
    {
      priority: prediction.priority,
      reason: prediction.reason,
      findings: prediction.findings,
      reviewerSuggestions: resolvedReviewerSuggestions,
    },
  );
}

function resolveQueuedPullRequestStatus(
  queuedStatus: string,
  persistedStatus: string | undefined,
): string {
  if (queuedStatus === 'open' && isTerminalPullRequestStatus(persistedStatus)) {
    return persistedStatus!;
  }

  return queuedStatus;
}

function isTerminalPullRequestStatus(
  status: string | undefined,
): status is 'closed' | 'merged' {
  return status === 'closed' || status === 'merged';
}

async function syncRepositoryIssues(
  repository: GithubRepository,
  installationId: number,
  githubService: GithubService,
  issuePriorityService: IssuePriorityService,
  issueService: IssueService,
) {
  await githubService.syncRepositoryLabels(installationId, repository.fullName);
  await issueService.deleteByRepositoryId(repository.id);

  let page = 1;
  let loggedSample = false;
  let hasMoreIssues = true;

  while (hasMoreIssues) {
    const githubIssues = await githubService.listRepositoryIssuesPage(
      installationId,
      repository.fullName,
      page,
      ISSUE_BATCH_SIZE,
    );
    const records: Array<{
      issue: DataObject<GithubIssue>;
      prediction: Awaited<
        ReturnType<IssuePriorityService['predictIssuePriority']>
      >;
    }> = [];
    const issueUpdates: Array<{
      issueNumber: number;
      description: string;
      processingReactionId: number | null;
      prediction: Awaited<
        ReturnType<IssuePriorityService['predictIssuePriority']>
      >;
    }> = [];

    for (const githubIssue of githubIssues) {
      const description = issuePriorityService.sanitizeIssueDescription(
        githubIssue.body ?? '',
      );
      const processingReactionId = await githubService.markIssueAsProcessing(
        installationId,
        repository.fullName,
        githubIssue.number,
      );

      const prediction = await issuePriorityService.predictIssuePriority({
        title: githubIssue.title,
        description,
      });

      records.push({
        issue: mapIssueToModel(repository.id, githubIssue, description),
        prediction,
      });
      issueUpdates.push({
        issueNumber: githubIssue.number,
        description,
        processingReactionId,
        prediction,
      });
    }

    if (records.length && !loggedSample) {
      console.log('GitHub worker issue sample', {
        repository: repository.fullName,
        issues: records.slice(0, 3),
      });
      loggedSample = true;
    }

    await issueService.saveIssuesBulk(records);

    for (const issueUpdate of issueUpdates) {
      await githubService.applyPriorityPredictionToIssue(
        installationId,
        repository.fullName,
        issueUpdate.issueNumber,
        issueUpdate.prediction,
        issueUpdate.description,
        issueUpdate.processingReactionId,
      );
    }

    hasMoreIssues = githubIssues.length === ISSUE_BATCH_SIZE;

    if (hasMoreIssues) {
      page += 1;
    }
  }
}

async function syncRepositoryLabels(
  repository: GithubRepository,
  installationId: number,
  githubService: GithubService,
  labelService: LabelService,
) {
  const labels = await githubService.syncRepositoryLabels(
    installationId,
    repository.fullName,
  );
  const records = labels.map(label => mapLabelToModel(repository.id, label));

  await labelService.replaceRepositoryLabels(repository.id, records);
}

async function syncRepositoryPullRequests(
  repository: GithubRepository,
  installationId: number,
  githubService: GithubService,
  issuePriorityService: IssuePriorityService,
  labelService: LabelService,
  pullRequestMergeRiskService: PullRequestMergeRiskService,
  pullRequestService: PullRequestService,
  userRepository: UserRepository,
  workspaceRepository: WorkspaceRepository,
  workspaceMemberRepository: WorkspaceMemberRepository,
  userExpertiseAssocRepository: UserExpertiseAssocRepository,
) {
  const workspace = await workspaceRepository.findById(repository.workspaceId);
  await pullRequestService.deleteByRepositoryId(repository.id);
  await syncRepositoryLabels(
    repository,
    installationId,
    githubService,
    labelService,
  );

  let page = 1;
  let hasMorePullRequests = true;

  while (hasMorePullRequests) {
    const pullRequests = await githubService.listRepositoryPullRequestsPage(
      installationId,
      repository.fullName,
      page,
      ISSUE_BATCH_SIZE,
    );
    const records: Array<{
      pullRequest: DataObject<GithubPullRequest>;
      prediction?:
        | Awaited<ReturnType<PullRequestMergeRiskService['predictMergeRisk']>>
        | undefined;
    }> = [];

    for (const pullRequest of pullRequests) {
      const description = issuePriorityService.sanitizeIssueDescription(
        pullRequest.body ?? '',
      );
      const reviewerSuggestionCandidatesForPullRequest =
        workspace.reviewerSuggestionSync === false
          ? []
          : await buildPullRequestReviewerSuggestionCandidates({
              workspace,
              authorGithubId: pullRequest.user?.id ?? null,
              userRepository,
              workspaceMemberRepository,
              userExpertiseAssocRepository,
            });
      let prediction:
        | Awaited<ReturnType<PullRequestMergeRiskService['predictMergeRisk']>>
        | undefined;
      let resolvedReviewerSuggestions: Array<{
        userId: number;
        username: string;
        reason: string;
      }> = [];

      if (pullRequest.state === 'open') {
        const processingReactionId =
          await githubService.markPullRequestAsProcessing(
            installationId,
            repository.fullName,
            pullRequest.number,
          );
        prediction = await pullRequestMergeRiskService.predictMergeRisk({
          installationId,
          repositoryFullName: repository.fullName,
          pullRequestNumber: pullRequest.number,
          title: pullRequest.title,
          description,
          reviewerExpertiseCandidates:
            workspace.reviewerSuggestionSync === false
              ? []
              : buildPullRequestReviewerExpertiseCandidates(
                  reviewerSuggestionCandidatesForPullRequest,
                ),
        });
        resolvedReviewerSuggestions = resolveReviewerSuggestionsFromExpertise(
          prediction.reviewerExpertiseSuggestions,
          reviewerSuggestionCandidatesForPullRequest,
        );
        console.log(
          'Pull request reviewer suggestions resolved from expertise',
          {
            workspaceId: workspace.id,
            repositoryFullName: repository.fullName,
            pullRequestNumber: pullRequest.number,
            reviewerExpertiseSuggestions:
              prediction.reviewerExpertiseSuggestions,
            resolvedReviewerSuggestions,
          },
        );

        try {
          await githubService.syncPullRequestReviewComments(
            installationId,
            repository.fullName,
            pullRequest.number,
            prediction.findings,
          );
        } catch (error) {
          console.warn('Pull request AI review comment sync failed', {
            repositoryFullName: repository.fullName,
            pullRequestNumber: pullRequest.number,
            error,
          });
        }

        if (workspace.reviewerSuggestionSync !== false) {
          console.log('Pull request reviewer sync gate passed', {
            workspaceId: workspace.id,
            repositoryFullName: repository.fullName,
            pullRequestNumber: pullRequest.number,
            reviewerSuggestionSync: workspace.reviewerSuggestionSync,
            resolvedReviewerUsernames: resolvedReviewerSuggestions.map(
              suggestion => suggestion.username,
            ),
          });
          try {
            await githubService.syncPullRequestReviewerSuggestionComment(
              installationId,
              repository.fullName,
              pullRequest.number,
              resolvedReviewerSuggestions.map(suggestion => ({
                username: suggestion.username,
                reason: suggestion.reason,
              })),
            );
            await githubService.requestPullRequestReviewers(
              installationId,
              repository.fullName,
              pullRequest.number,
              resolvedReviewerSuggestions.map(
                suggestion => suggestion.username,
              ),
            );
          } catch (error) {
            console.warn('Pull request reviewer suggestion sync failed', {
              repositoryFullName: repository.fullName,
              pullRequestNumber: pullRequest.number,
              error,
            });
          }
        } else {
          console.log('Pull request reviewer sync gate skipped', {
            workspaceId: workspace.id,
            repositoryFullName: repository.fullName,
            pullRequestNumber: pullRequest.number,
            reviewerSuggestionSync: workspace.reviewerSuggestionSync,
            resolvedReviewerUsernames: resolvedReviewerSuggestions.map(
              suggestion => suggestion.username,
            ),
          });
        }

        await githubService.applyMergeRiskPredictionToPullRequest(
          installationId,
          repository.fullName,
          pullRequest.number,
          prediction,
          description,
          processingReactionId,
        );
      }

      records.push({
        pullRequest: await mapPullRequestToModel(
          repository.id,
          pullRequest,
          description,
          userRepository,
        ),
        prediction: prediction
          ? {
              ...prediction,
              reviewerSuggestions: resolvedReviewerSuggestions,
            }
          : undefined,
      });
    }

    await pullRequestService.savePullRequestsBulk(records);

    hasMorePullRequests = pullRequests.length === ISSUE_BATCH_SIZE;

    if (hasMorePullRequests) {
      page += 1;
    }
  }
}

async function buildPullRequestReviewerSuggestionCandidates(input: {
  workspace: Workspace;
  authorGithubId?: number | null;
  userRepository: UserRepository;
  workspaceMemberRepository: WorkspaceMemberRepository;
  userExpertiseAssocRepository: UserExpertiseAssocRepository;
}): Promise<
  Array<{
    userId: number;
    username: string;
    fullName: string;
    workspaceRole: 'OWNER' | 'ADMIN' | 'MEMBER';
    expertises: Array<{
      name: string;
      description?: string | null;
    }>;
  }>
> {
  console.log('WorkspaceId', input.workspace.id);
  const workspaceMembers = await input.workspaceMemberRepository.find({
    where: {workspaceId: input.workspace.id},
    include: [{relation: 'user'}],
  });
  console.log('Workspace members: ', workspaceMembers);
  const owner = await input.userRepository.findOne({
    where: {id: input.workspace.ownerId},
  });
  const candidateUsers = new Map<
    number,
    {
      user: User;
      workspaceRole: 'OWNER' | 'ADMIN' | 'MEMBER';
    }
  >();

  if (owner) {
    candidateUsers.set(owner.id, {
      user: owner,
      workspaceRole: 'OWNER',
    });
  }

  for (const member of workspaceMembers) {
    const user = (member as WorkspaceMemberWithRelations).user;

    if (!user?.id) {
      continue;
    }

    candidateUsers.set(user.id, {
      user,
      workspaceRole: member.role === 'ADMIN' ? 'ADMIN' : 'MEMBER',
    });
  }

  const userIds = Array.from(candidateUsers.keys());
  const expertiseAssocs = userIds.length
    ? await input.userExpertiseAssocRepository.find({
        where: {userId: {inq: userIds}},
        include: [{relation: 'expertise'}],
      })
    : [];
  const expertiseByUserId = buildExpertiseByUserId(
    input.workspace.id,
    expertiseAssocs,
  );

  return Array.from(candidateUsers.values())
    .filter(
      candidate =>
        !isSameGithubUser(candidate.user.githubId, input.authorGithubId) &&
        Boolean(candidate.user.username?.trim()),
    )
    .map(candidate => ({
      userId: candidate.user.id,
      username: candidate.user.username.trim(),
      fullName: candidate.user.fullName.trim(),
      workspaceRole: candidate.workspaceRole,
      expertises: expertiseByUserId.get(candidate.user.id) ?? [],
    }))
    .filter(candidate => candidate.expertises.length > 0);
}

function buildExpertiseByUserId(
  workspaceId: number,
  expertiseAssocs: UserExpertiseAssocWithRelations[],
): Map<
  number,
  Array<{
    name: string;
    description?: string | null;
  }>
> {
  const expertiseByUserId = new Map<
    number,
    Array<{
      name: string;
      description?: string | null;
    }>
  >();

  for (const assoc of expertiseAssocs) {
    const expertise = assoc.expertise;

    if (!assoc.userId || !expertise || expertise.workspaceId !== workspaceId) {
      continue;
    }

    const currentExpertises = expertiseByUserId.get(assoc.userId) ?? [];

    if (currentExpertises.some(entry => entry.name === expertise.name)) {
      expertiseByUserId.set(assoc.userId, currentExpertises);
      continue;
    }

    currentExpertises.push({
      name: expertise.name,
      description: expertise.description ?? null,
    });
    expertiseByUserId.set(assoc.userId, currentExpertises);
  }

  return expertiseByUserId;
}

function buildPullRequestReviewerExpertiseCandidates(
  reviewerSuggestionCandidates: Array<{
    expertises: Array<{
      name: string;
      description?: string | null;
    }>;
  }>,
): Array<{
  name: string;
  description?: string | null;
}> {
  const expertiseByKey = new Map<
    string,
    {
      name: string;
      description?: string | null;
    }
  >();

  for (const candidate of reviewerSuggestionCandidates) {
    for (const expertise of candidate.expertises) {
      const expertiseKey = normalizeExpertiseKey(expertise.name);

      if (!expertiseKey || expertiseByKey.has(expertiseKey)) {
        continue;
      }

      expertiseByKey.set(expertiseKey, {
        name: expertise.name,
        description: expertise.description ?? null,
      });
    }
  }

  return Array.from(expertiseByKey.values()).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

function resolveReviewerSuggestionsFromExpertise(
  reviewerExpertiseSuggestions: PullRequestReviewerExpertiseSuggestion[],
  reviewerSuggestionCandidates: Array<{
    userId: number;
    username: string;
    fullName: string;
    workspaceRole: 'OWNER' | 'ADMIN' | 'MEMBER';
    expertises: Array<{
      name: string;
      description?: string | null;
    }>;
  }>,
): Array<{
  userId: number;
  username: string;
  reason: string;
}> {
  if (
    !reviewerExpertiseSuggestions.length ||
    !reviewerSuggestionCandidates.length
  ) {
    return [];
  }

  const candidatesByExpertise = new Map<
    string,
    typeof reviewerSuggestionCandidates
  >();

  for (const candidate of getSortedReviewerSuggestionCandidates(
    reviewerSuggestionCandidates,
  )) {
    for (const expertise of candidate.expertises) {
      const expertiseKey = normalizeExpertiseKey(expertise.name);

      if (!expertiseKey) {
        continue;
      }

      const currentCandidates = candidatesByExpertise.get(expertiseKey) ?? [];
      currentCandidates.push(candidate);
      candidatesByExpertise.set(expertiseKey, currentCandidates);
    }
  }

  const selectedUserIds = new Set<number>();
  const resolvedSuggestions: Array<{
    userId: number;
    username: string;
    reason: string;
  }> = [];

  for (const suggestion of reviewerExpertiseSuggestions) {
    const expertiseKey = normalizeExpertiseKey(suggestion.expertise);

    if (!expertiseKey) {
      continue;
    }

    const matchedCandidates = (
      candidatesByExpertise.get(expertiseKey) ?? []
    ).filter(candidate => !selectedUserIds.has(candidate.userId));

    if (!matchedCandidates.length) {
      continue;
    }

    for (const matchedCandidate of matchedCandidates) {
      selectedUserIds.add(matchedCandidate.userId);
      resolvedSuggestions.push({
        userId: matchedCandidate.userId,
        username: matchedCandidate.username,
        reason: suggestion.reason,
      });

      if (resolvedSuggestions.length >= 2) {
        break;
      }
    }

    if (resolvedSuggestions.length >= 2) {
      break;
    }
  }

  return resolvedSuggestions;
}

function getSortedReviewerSuggestionCandidates(
  reviewerSuggestionCandidates: Array<{
    userId: number;
    username: string;
    fullName: string;
    workspaceRole: 'OWNER' | 'ADMIN' | 'MEMBER';
    expertises: Array<{
      name: string;
      description?: string | null;
    }>;
  }>,
) {
  return [...reviewerSuggestionCandidates].sort((left, right) => {
    const roleDifference =
      getWorkspaceRoleRank(left.workspaceRole) -
      getWorkspaceRoleRank(right.workspaceRole);

    if (roleDifference !== 0) {
      return roleDifference;
    }

    const fullNameDifference = left.fullName.localeCompare(right.fullName);

    if (fullNameDifference !== 0) {
      return fullNameDifference;
    }

    return left.username.localeCompare(right.username);
  });
}

function getWorkspaceRoleRank(role: 'OWNER' | 'ADMIN' | 'MEMBER'): number {
  switch (role) {
    case 'OWNER':
      return 0;
    case 'ADMIN':
      return 1;
    case 'MEMBER':
      return 2;
  }
}

function normalizeExpertiseKey(value: string | undefined): string {
  return value?.trim().toLowerCase().replace(/\s+/g, ' ') ?? '';
}

function isSameGithubUser(
  leftGithubId: number | string | null | undefined,
  rightGithubId: number | string | null | undefined,
): boolean {
  if (leftGithubId == null || rightGithubId == null) {
    return false;
  }

  return String(leftGithubId).trim() === String(rightGithubId).trim();
}

async function ensureMinimumProcessingReactionDuration(
  startedAt: number,
): Promise<void> {
  const elapsed = Date.now() - startedAt;

  if (elapsed >= MIN_PULL_REQUEST_PROCESSING_REACTION_MS) {
    return;
  }

  await new Promise(resolve =>
    setTimeout(resolve, MIN_PULL_REQUEST_PROCESSING_REACTION_MS - elapsed),
  );
}

function mapIssueToModel(
  repositoryId: number,
  issue: Awaited<ReturnType<GithubService['listRepositoryIssuesPage']>>[number],
  description: string,
): DataObject<GithubIssue> {
  return {
    repositoryId,
    githubId: issue.id,
    githubIssueNumber: issue.number,
    title: issue.title,
    status: issue.state,
    description,
  };
}

function getJobMetadata(jobData: GithubIssuesJobData): Record<string, number> {
  if ('workspaceId' in jobData) {
    return {
      workspaceId: jobData.workspaceId,
      installationId: jobData.installationId,
    };
  }

  if ('pullRequestNumber' in jobData) {
    return {
      repositoryId: jobData.repositoryId,
      installationId: jobData.installationId,
      pullRequestNumber: jobData.pullRequestNumber,
    };
  }

  return {
    repositoryId: jobData.repositoryId,
  };
}

async function mapPullRequestToModel(
  repositoryId: number,
  pullRequest: Awaited<
    ReturnType<GithubService['listRepositoryPullRequestsPage']>
  >[number],
  description: string,
  userRepository: UserRepository,
): Promise<DataObject<GithubPullRequest>> {
  const author = pullRequest.user
    ? await userRepository.findOne({
        where: {githubId: pullRequest.user.id},
      })
    : null;

  return {
    repositoryId,
    githubPrNumber: pullRequest.number,
    title: pullRequest.title,
    status: pullRequest.merged_at ? 'merged' : pullRequest.state,
    description,
    authorId: author?.id ?? null,
  };
}

function mapLabelToModel(
  repositoryId: number,
  label: Awaited<ReturnType<GithubService['syncRepositoryLabels']>>[number],
): DataObject<GithubLabel> {
  return {
    repositoryId,
    githubLabelId: label.id,
    name: label.name,
    color: label.color,
  };
}

startWorker().catch(error => {
  console.error('Unable to start GitHub issues worker', error);
  process.exit(1);
});
