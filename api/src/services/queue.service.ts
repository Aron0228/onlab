import {BindingScope, injectable, service} from '@loopback/core';
import {JobsOptions, Queue} from 'bullmq';
import {RedisService} from './redis.service';

export const GITHUB_ISSUES_QUEUE_NAME = 'github-issues-queue';
export const SYNC_GITHUB_ISSUES_JOB_NAME = 'sync-issues';
export const SYNC_GITHUB_LABELS_JOB_NAME = 'sync-labels';
export const CREATE_GITHUB_ISSUE_JOB_NAME = 'create-issue';
export const PRIORITIZE_GITHUB_PULL_REQUEST_JOB_NAME =
  'prioritize-pull-request';

export type SyncGithubIssuesJobData = {
  installationId: number;
  workspaceId: number;
};

export type CreateGithubIssueJobData = {
  repositoryId: number;
  title: string;
  description: string;
};

export type PrioritizeGithubPullRequestJobData = {
  installationId: number;
  repositoryId: number;
  repositoryFullName: string;
  githubId: number;
  pullRequestNumber: number;
  title: string;
  description: string;
  status: string;
  authorGithubId?: number | null;
};

export type GithubIssuesJobData =
  | SyncGithubIssuesJobData
  | CreateGithubIssueJobData
  | PrioritizeGithubPullRequestJobData;

@injectable({scope: BindingScope.SINGLETON})
export class QueueService {
  private readonly githubIssuesQueue: Queue<GithubIssuesJobData>;

  constructor(@service(RedisService) private redisService: RedisService) {
    this.githubIssuesQueue = new Queue<GithubIssuesJobData>(
      GITHUB_ISSUES_QUEUE_NAME,
      {
        connection: this.redisService.getConnectionOptions(),
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      },
    );
  }

  public async enqueueGithubIssuesSync(
    data: SyncGithubIssuesJobData,
    options: Pick<JobsOptions, 'delay'> = {},
  ) {
    return this.githubIssuesQueue.add(SYNC_GITHUB_ISSUES_JOB_NAME, data, {
      delay: options.delay,
    });
  }

  public async enqueueGithubLabelsSync(
    data: SyncGithubIssuesJobData,
    options: Pick<JobsOptions, 'delay'> = {},
  ) {
    return this.githubIssuesQueue.add(SYNC_GITHUB_LABELS_JOB_NAME, data, {
      delay: options.delay,
    });
  }

  public async enqueueGithubIssueCreation(
    data: CreateGithubIssueJobData,
    options: Pick<JobsOptions, 'delay'> = {},
  ) {
    return this.githubIssuesQueue.add(CREATE_GITHUB_ISSUE_JOB_NAME, data, {
      delay: options.delay,
    });
  }

  public async enqueueGithubPullRequestPrioritization(
    data: PrioritizeGithubPullRequestJobData,
    options: Pick<JobsOptions, 'delay'> = {},
  ) {
    return this.githubIssuesQueue.add(
      PRIORITIZE_GITHUB_PULL_REQUEST_JOB_NAME,
      data,
      {
        delay: options.delay,
      },
    );
  }

  public getGithubIssuesQueue(): Queue<GithubIssuesJobData> {
    return this.githubIssuesQueue;
  }

  public async close(): Promise<void> {
    await this.githubIssuesQueue.close();
  }
}
