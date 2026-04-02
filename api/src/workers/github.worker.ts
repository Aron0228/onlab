import * as dotenv from 'dotenv';
import {DataObject} from '@loopback/repository';
import {Job, Worker} from 'bullmq';
import {RestApi} from '../application';
import {
  GithubIssue,
  GithubLabel,
  GithubPullRequest,
  GithubRepository,
} from '../models';
import {
  GithubRepositoryRepository,
  UserRepository,
  WorkspaceRepository,
} from '../repositories';
import {
  CREATE_GITHUB_ISSUE_JOB_NAME,
  type CreateGithubIssueJobData,
  GITHUB_ISSUES_QUEUE_NAME,
  GithubService,
  type GithubIssuesJobData,
  type IssuePriorityPrediction,
  IssuePriorityService,
  IssueService,
  LabelService,
  PRIORITIZE_GITHUB_PULL_REQUEST_JOB_NAME,
  type PrioritizeGithubPullRequestJobData,
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
          issuePriorityService,
          pullRequestMergeRiskService,
          pullRequestService,
          userRepository,
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
      prediction,
    ),
    {
      repositoryId: repository.id,
      githubId: githubIssue.id,
    },
  );
}

async function processPrioritizePullRequestJob(
  job: Job<PrioritizeGithubPullRequestJobData>,
  githubService: GithubService,
  issuePriorityService: IssuePriorityService,
  pullRequestMergeRiskService: PullRequestMergeRiskService,
  pullRequestService: PullRequestService,
  userRepository: UserRepository,
) {
  const processingStartedAt = Date.now();

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
      priority: prediction.priority,
      priorityReason: prediction.reason,
      authorId: author?.id ?? null,
    },
    {
      repositoryId: job.data.repositoryId,
      githubPrNumber: job.data.pullRequestNumber,
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
    const records: DataObject<GithubIssue>[] = [];
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

      records.push(
        mapIssueToModel(repository.id, githubIssue, description, prediction),
      );
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
) {
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
    const records: DataObject<GithubPullRequest>[] = [];

    for (const pullRequest of pullRequests) {
      const description = issuePriorityService.sanitizeIssueDescription(
        pullRequest.body ?? '',
      );
      let prediction:
        | Awaited<ReturnType<PullRequestMergeRiskService['predictMergeRisk']>>
        | undefined;

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
        });

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

        await githubService.applyMergeRiskPredictionToPullRequest(
          installationId,
          repository.fullName,
          pullRequest.number,
          prediction,
          description,
          processingReactionId,
        );
      }

      records.push(
        await mapPullRequestToModel(
          repository.id,
          pullRequest,
          prediction,
          description,
          userRepository,
        ),
      );
    }

    await pullRequestService.savePullRequestsBulk(records);

    hasMorePullRequests = pullRequests.length === ISSUE_BATCH_SIZE;

    if (hasMorePullRequests) {
      page += 1;
    }
  }
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
  prediction: IssuePriorityPrediction,
): DataObject<GithubIssue> {
  return {
    repositoryId,
    githubId: issue.id,
    githubIssueNumber: issue.number,
    title: issue.title,
    status: issue.state,
    description,
    priority: prediction.priority,
    priorityReason: prediction.reason,
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
  prediction:
    | {
        priority: string;
        reason: string;
      }
    | undefined,
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
    priority: prediction?.priority,
    priorityReason: prediction?.reason,
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
