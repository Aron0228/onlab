import * as dotenv from 'dotenv';
import {Job, Worker} from 'bullmq';
import {RestApi} from '../application';
import {GithubIssue, GithubRepository} from '../models';
import {GithubRepositoryRepository} from '../repositories';
import {
  GITHUB_ISSUES_QUEUE_NAME,
  GithubService,
  IssueService,
  RedisService,
  SYNC_GITHUB_ISSUES_JOB_NAME,
  SyncGithubIssuesJobData,
} from '../services';
import {DataObject} from '@loopback/repository';

dotenv.config();

const ISSUE_BATCH_SIZE = 100;

async function startWorker() {
  const app = new RestApi();
  await app.boot();

  const redisService = await app.get<RedisService>('services.RedisService');
  const githubService = await app.get<GithubService>('services.GithubService');
  const issueService = await app.get<IssueService>('services.IssueService');
  const githubRepositoryRepository = await app.get<GithubRepositoryRepository>(
    'repositories.GithubRepositoryRepository',
  );

  const worker = new Worker<SyncGithubIssuesJobData>(
    GITHUB_ISSUES_QUEUE_NAME,
    async job => {
      if (job.name !== SYNC_GITHUB_ISSUES_JOB_NAME) {
        return;
      }

      await processSyncIssuesJob(
        job,
        githubService,
        githubRepositoryRepository,
        issueService,
      );
    },
    {
      connection: redisService.getConnectionOptions(),
    },
  );

  worker.on('completed', job => {
    console.log('GitHub issues sync job completed', {
      jobId: job.id,
      workspaceId: job.data.workspaceId,
      installationId: job.data.installationId,
    });
  });

  worker.on('failed', (job, error) => {
    console.error('GitHub issues sync job failed', {
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
  issueService: IssueService,
) {
  const repositories = await githubRepositoryRepository.find({
    where: {workspaceId: job.data.workspaceId},
  });

  for (const repository of repositories) {
    await syncRepositoryIssues(
      repository,
      job.data.installationId,
      githubService,
      issueService,
    );
  }
}

async function syncRepositoryIssues(
  repository: GithubRepository,
  installationId: number,
  githubService: GithubService,
  issueService: IssueService,
) {
  await issueService.deleteByRepositoryId(repository.id);

  let page = 1;
  let loggedSample = false;
  let hasMoreIssues = true;

  while (hasMoreIssues) {
    const issues = await githubService.listRepositoryIssuesPage(
      installationId,
      repository.fullName,
      page,
      ISSUE_BATCH_SIZE,
    );
    const records = issues.map(issue => mapIssueToModel(repository.id, issue));

    if (records.length && !loggedSample) {
      console.log('GitHub worker issue sample', {
        repository: repository.fullName,
        issues: records.slice(0, 3),
      });
      loggedSample = true;
    }

    await issueService.saveIssuesBulk(records);

    hasMoreIssues = issues.length === ISSUE_BATCH_SIZE;

    if (hasMoreIssues) {
      page += 1;
    }
  }
}

function mapIssueToModel(
  repositoryId: number,
  issue: Awaited<ReturnType<GithubService['listRepositoryIssuesPage']>>[number],
): DataObject<GithubIssue> {
  return {
    repositoryId,
    githubId: issue.id,
    title: issue.title,
    description: issue.body ?? '',
  };
}

startWorker().catch(error => {
  console.error('Unable to start GitHub issues worker', error);
  process.exit(1);
});
