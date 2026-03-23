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
  GITHUB_ISSUES_QUEUE_NAME,
  GithubService,
  type IssuePriorityPrediction,
  IssuePriorityService,
  IssueService,
  LabelService,
  PullRequestService,
  RedisService,
  SYNC_GITHUB_LABELS_JOB_NAME,
  SYNC_GITHUB_ISSUES_JOB_NAME,
  SyncGithubIssuesJobData,
} from '../services';

dotenv.config();

const ISSUE_BATCH_SIZE = 100;

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

  const worker = new Worker<SyncGithubIssuesJobData>(
    GITHUB_ISSUES_QUEUE_NAME,
    async job => {
      if (job.name !== SYNC_GITHUB_ISSUES_JOB_NAME) {
        if (job.name !== SYNC_GITHUB_LABELS_JOB_NAME) {
          return;
        }

        await processSyncLabelsJob(
          job,
          githubService,
          githubRepositoryRepository,
          labelService,
        );
        return;
      }

      await processSyncIssuesJob(
        job,
        githubService,
        githubRepositoryRepository,
        workspaceRepository,
        issuePriorityService,
        issueService,
        pullRequestService,
        userRepository,
      );
    },
    {
      connection: redisService.getConnectionOptions(),
    },
  );

  worker.on('completed', job => {
    console.log('GitHub sync job completed', {
      jobName: job.name,
      jobId: job.id,
      workspaceId: job.data.workspaceId,
      installationId: job.data.installationId,
    });
  });

  worker.on('failed', (job, error) => {
    console.error('GitHub sync job failed', {
      jobName: job?.name,
      jobId: job?.id,
      workspaceId: job?.data.workspaceId,
      installationId: job?.data.installationId,
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
      prediction: Awaited<
        ReturnType<IssuePriorityService['predictIssuePriority']>
      >;
    }> = [];

    for (const githubIssue of githubIssues) {
      const description = issuePriorityService.sanitizeIssueDescription(
        githubIssue.body ?? '',
      );
      const processingDescription =
        issuePriorityService.prependProcessingEmoji(description);

      await githubService.markIssueAsProcessing(
        installationId,
        repository.fullName,
        githubIssue.number,
        description,
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
        description: processingDescription,
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
  pullRequestService: PullRequestService,
  userRepository: UserRepository,
) {
  await pullRequestService.deleteByRepositoryId(repository.id);

  let page = 1;
  let hasMorePullRequests = true;

  while (hasMorePullRequests) {
    const pullRequests = await githubService.listRepositoryPullRequestsPage(
      installationId,
      repository.fullName,
      page,
      ISSUE_BATCH_SIZE,
    );
    const records = await Promise.all(
      pullRequests.map(pullRequest =>
        mapPullRequestToModel(repository.id, pullRequest, userRepository),
      ),
    );

    await pullRequestService.savePullRequestsBulk(records);

    hasMorePullRequests = pullRequests.length === ISSUE_BATCH_SIZE;

    if (hasMorePullRequests) {
      page += 1;
    }
  }
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

async function mapPullRequestToModel(
  repositoryId: number,
  pullRequest: Awaited<
    ReturnType<GithubService['listRepositoryPullRequestsPage']>
  >[number],
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
    description: pullRequest.body ?? '',
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
