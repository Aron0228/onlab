import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const queueAdd = vi.fn();
const queueClose = vi.fn().mockResolvedValue(undefined);
const queueConstructor = vi.fn(function QueueMock() {
  return {
    add: queueAdd,
    close: queueClose,
  };
});

vi.mock('bullmq', () => ({
  Queue: queueConstructor,
}));

describe('QueueService (unit)', () => {
  const originalEnv = {
    VITEST: process.env.VITEST,
    NODE_ENV: process.env.NODE_ENV,
  };

  beforeEach(() => {
    vi.resetModules();
    queueAdd.mockReset();
    queueClose.mockClear();
    queueConstructor.mockClear();
  });

  afterEach(() => {
    process.env.VITEST = originalEnv.VITEST;
    process.env.NODE_ENV = originalEnv.NODE_ENV;
  });

  it('does not construct a queue in test environments and skips news-feed enqueueing', async () => {
    process.env.VITEST = 'true';

    const {QueueService} = await import('../../../services/queue.service');

    const service = new QueueService({
      getConnectionOptions: vi.fn(),
    } as never);

    await expect(
      service.enqueueNewsFeedPrediction({
        workspaceId: 1,
        sourceType: 'github-issue',
        sourceId: 2,
        eventAction: 'created',
        happenedAt: '2026-04-16T09:00:00.000Z',
        snapshot: {
          title: 'Issue',
          summary: 'Summary',
        },
      }),
    ).resolves.toBeUndefined();
    expect(queueConstructor).not.toHaveBeenCalled();
    expect(() => service.getGithubIssuesQueue()).toThrow(
      'GitHub issues queue is not available in the current environment',
    );
  });

  it('constructs the queue and enqueues all supported job types outside tests', async () => {
    process.env.VITEST = '';
    process.env.NODE_ENV = 'development';

    const {QueueService} = await import('../../../services/queue.service');
    const {
      CREATE_GITHUB_ISSUE_JOB_NAME,
      PREDICT_NEWS_FEED_ENTRY_JOB_NAME,
      PRIORITIZE_GITHUB_PULL_REQUEST_JOB_NAME,
      SYNC_GITHUB_ISSUES_JOB_NAME,
      SYNC_GITHUB_LABELS_JOB_NAME,
    } = await import('../../../services/queue.service');

    const service = new QueueService({
      getConnectionOptions: vi.fn().mockReturnValue({host: 'redis'}),
    } as never);

    await service.enqueueGithubIssuesSync(
      {installationId: 1, workspaceId: 2},
      {delay: 10},
    );
    await service.enqueueGithubLabelsSync(
      {installationId: 1, workspaceId: 2},
      {delay: 11},
    );
    await service.enqueueGithubIssueCreation(
      {repositoryId: 5, title: 'Issue', description: 'Desc'},
      {delay: 12},
    );
    await service.enqueueGithubPullRequestPrioritization(
      {
        installationId: 1,
        repositoryId: 5,
        repositoryFullName: 'team/api',
        githubId: 8,
        pullRequestNumber: 13,
        title: 'PR',
        description: 'Desc',
        status: 'open',
      },
      {delay: 13},
    );
    await service.enqueueNewsFeedPrediction(
      {
        workspaceId: 2,
        sourceType: 'github-pull-request',
        sourceId: 13,
        eventAction: 'updated',
        happenedAt: '2026-04-16T09:00:00.000Z',
        snapshot: {
          title: 'PR',
          summary: 'Updated',
        },
      },
      {delay: 14},
    );
    await service.close();

    expect(queueConstructor).toHaveBeenCalledWith(
      'github-issues-queue',
      expect.objectContaining({
        connection: {host: 'redis'},
      }),
    );
    expect(queueAdd.mock.calls).toEqual([
      [
        SYNC_GITHUB_ISSUES_JOB_NAME,
        {installationId: 1, workspaceId: 2},
        {delay: 10},
      ],
      [
        SYNC_GITHUB_LABELS_JOB_NAME,
        {installationId: 1, workspaceId: 2},
        {delay: 11},
      ],
      [
        CREATE_GITHUB_ISSUE_JOB_NAME,
        {repositoryId: 5, title: 'Issue', description: 'Desc'},
        {delay: 12},
      ],
      [
        PRIORITIZE_GITHUB_PULL_REQUEST_JOB_NAME,
        expect.objectContaining({pullRequestNumber: 13}),
        {delay: 13},
      ],
      [
        PREDICT_NEWS_FEED_ENTRY_JOB_NAME,
        expect.objectContaining({sourceId: 13}),
        {delay: 14},
      ],
    ]);
    expect(queueClose).toHaveBeenCalledOnce();
  });
});
