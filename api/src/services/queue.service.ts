import {BindingScope, injectable, service} from '@loopback/core';
import {JobsOptions, Queue} from 'bullmq';
import {RedisService} from './redis.service';

export const GITHUB_ISSUES_QUEUE_NAME = 'github-issues-queue';
export const SYNC_GITHUB_ISSUES_JOB_NAME = 'sync-issues';

export type SyncGithubIssuesJobData = {
  installationId: number;
  workspaceId: number;
};

@injectable({scope: BindingScope.SINGLETON})
export class QueueService {
  private readonly githubIssuesQueue: Queue<SyncGithubIssuesJobData>;

  constructor(@service(RedisService) private redisService: RedisService) {
    this.githubIssuesQueue = new Queue<SyncGithubIssuesJobData>(
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

  public getGithubIssuesQueue(): Queue<SyncGithubIssuesJobData> {
    return this.githubIssuesQueue;
  }

  public async close(): Promise<void> {
    await this.githubIssuesQueue.close();
  }
}
