import {juggler} from '@loopback/repository';
import {describe, expect, it, vi} from 'vitest';

import {
  CapacityPlan,
  GithubIssue,
  GithubPullRequest,
  NewsFeedEntry,
  WorkspaceMember,
} from '../../../models';
import {
  CapacityPlanRepository,
  GithubIssueRepository,
  GithubPullRequestRepository,
  NewsFeedEntryExpertiseAssocRepository,
  NewsFeedEntryRepository,
  WorkspaceMemberRepository,
} from '../../../repositories';
import {NewsFeedPredictionJobSnapshot} from '../../../services/queue.service';

type IssueRepositoryNewsFeedInternals = GithubIssueRepository & {
  repository: ReturnType<typeof vi.fn>;
  buildNewsFeedPredictionSnapshot(context: {
    eventAction: 'created' | 'updated';
    previous?: GithubIssue;
    current: GithubIssue;
  }): Promise<NewsFeedPredictionJobSnapshot>;
  shouldEnqueueNewsFeedUpdate(
    previous: GithubIssue,
    current: GithubIssue,
    patch: object,
  ): Promise<boolean>;
};

type PullRequestRepositoryNewsFeedInternals = GithubPullRequestRepository & {
  repository: ReturnType<typeof vi.fn>;
  buildNewsFeedPredictionSnapshot(context: {
    eventAction: 'created' | 'updated';
    previous?: GithubPullRequest;
    current: GithubPullRequest;
  }): Promise<NewsFeedPredictionJobSnapshot>;
  shouldEnqueueNewsFeedUpdate(
    previous: GithubPullRequest,
    current: GithubPullRequest,
    patch: object,
  ): Promise<boolean>;
};

type WorkspaceMemberRepositoryNewsFeedInternals = WorkspaceMemberRepository & {
  user: ReturnType<typeof vi.fn>;
  workspace: ReturnType<typeof vi.fn>;
  buildNewsFeedPredictionSnapshot(context: {
    eventAction: 'created' | 'updated';
    previous?: WorkspaceMember;
    current: WorkspaceMember;
  }): Promise<NewsFeedPredictionJobSnapshot>;
  shouldEnqueueNewsFeedUpdate(): Promise<boolean>;
};

type CapacityPlanRepositoryNewsFeedInternals = CapacityPlanRepository & {
  workspace: ReturnType<typeof vi.fn>;
  buildNewsFeedPredictionSnapshot(context: {
    eventAction: 'created' | 'updated';
    previous?: CapacityPlan;
    current: CapacityPlan;
  }): Promise<NewsFeedPredictionJobSnapshot>;
  shouldEnqueueNewsFeedUpdate(): Promise<boolean>;
};

describe('News feed repositories (unit)', () => {
  const dataSource = new juggler.DataSource({
    name: 'db',
    connector: 'memory',
  });

  it('registers news feed entry relations and sorts personalized fallback feed by priority then recency', async () => {
    const userExpertiseAssocRepositoryGetter = vi.fn().mockResolvedValue({
      find: vi.fn().mockResolvedValue([]),
    });
    const repository = new NewsFeedEntryRepository(
      dataSource as never,
      async () => ({}) as never,
      userExpertiseAssocRepositoryGetter as never,
    );
    vi.spyOn(repository, 'find').mockResolvedValue([
      new NewsFeedEntry({
        id: 1,
        workspaceId: 8,
        sourceType: 'github-issue',
        sourceId: 10,
        eventAction: 'created',
        title: 'Low',
        summary: 'Low',
        sourcePriority: 'low',
        happenedAt: '2026-04-14T10:00:00.000Z',
      }),
      new NewsFeedEntry({
        id: 2,
        workspaceId: 8,
        sourceType: 'github-issue',
        sourceId: 11,
        eventAction: 'created',
        title: 'High',
        summary: 'High',
        sourcePriority: 'high',
        happenedAt: '2026-04-13T10:00:00.000Z',
      }),
      new NewsFeedEntry({
        id: 3,
        workspaceId: 8,
        sourceType: 'github-issue',
        sourceId: 12,
        eventAction: 'created',
        title: 'Recent unknown',
        summary: 'Recent unknown',
        sourcePriority: 'unknown',
        happenedAt: '2026-04-16T10:00:00.000Z',
      }),
    ]);

    const entries = await repository.findPersonalizedFeed(8, 3);

    expect(typeof repository.expertiseAssocs).toBe('function');
    expect(repository.inclusionResolvers.has('expertiseAssocs')).toBe(true);
    expect(entries.map(entry => entry.id)).toEqual([2, 1, 3]);
  });

  it('filters personalized feed entries by the user workspace expertises and de-duplicates them', async () => {
    const assocRepository = {
      find: vi.fn().mockResolvedValue([
        {
          newsFeedEntryId: 11,
          expertiseId: 4,
          newsFeedEntry: new NewsFeedEntry({
            id: 11,
            workspaceId: 9,
            sourceType: 'github-pull-request',
            sourceId: 31,
            eventAction: 'updated',
            title: 'PR',
            summary: 'PR',
            sourcePriority: 'medium',
            happenedAt: '2026-04-16T09:00:00.000Z',
          }),
        },
        {
          newsFeedEntryId: 11,
          expertiseId: 5,
          newsFeedEntry: new NewsFeedEntry({
            id: 11,
            workspaceId: 9,
            sourceType: 'github-pull-request',
            sourceId: 31,
            eventAction: 'updated',
            title: 'PR',
            summary: 'PR',
            sourcePriority: 'medium',
            happenedAt: '2026-04-16T09:00:00.000Z',
          }),
        },
        {
          newsFeedEntryId: 12,
          expertiseId: 4,
          newsFeedEntry: new NewsFeedEntry({
            id: 12,
            workspaceId: 99,
            sourceType: 'github-issue',
            sourceId: 32,
            eventAction: 'created',
            title: 'Other workspace',
            summary: 'Other workspace',
            sourcePriority: 'very-high',
            happenedAt: '2026-04-16T10:00:00.000Z',
          }),
        },
      ]),
    };
    const repository = new NewsFeedEntryRepository(
      dataSource as never,
      async () => assocRepository as never,
      async () =>
        ({
          find: vi.fn().mockResolvedValue([
            {
              expertiseId: 4,
              expertise: {id: 4, workspaceId: 9},
            },
            {
              expertiseId: 5,
              expertise: {id: 5, workspaceId: 9},
            },
          ]),
        }) as never,
    );

    const entries = await repository.findPersonalizedFeed(9, 6);

    expect(assocRepository.find).toHaveBeenCalledWith({
      where: {
        expertiseId: {inq: [4, 5]},
      },
      include: ['newsFeedEntry'],
    });
    expect(entries.map(entry => entry.id)).toEqual([11]);
  });

  it('registers news feed entry expertise association relations', () => {
    const repository = new NewsFeedEntryExpertiseAssocRepository(
      dataSource as never,
      async () => ({}) as never,
      async () => ({}) as never,
    );

    expect(typeof repository.newsFeedEntry).toBe('function');
    expect(typeof repository.expertise).toBe('function');
    expect(repository.inclusionResolvers.has('newsFeedEntry')).toBe(true);
    expect(repository.inclusionResolvers.has('expertise')).toBe(true);
  });

  it('builds issue and pull request snapshots for created and updated events', async () => {
    const issueRepository = new GithubIssueRepository(
      dataSource as never,
      {} as never,
      async () => ({}) as never,
      async () => ({}) as never,
      async () => ({}) as never,
    );
    const issueRepositoryInternals =
      issueRepository as unknown as IssueRepositoryNewsFeedInternals;
    issueRepositoryInternals.repository = vi.fn().mockResolvedValue({
      workspaceId: 7,
      fullName: 'team/api',
    }) as never;

    await expect(
      issueRepositoryInternals.buildNewsFeedPredictionSnapshot({
        eventAction: 'created',
        current: new GithubIssue({
          id: 5,
          githubIssueNumber: 18,
          title: 'Broken auth',
          description: '',
          status: 'open',
        }),
      }),
    ).resolves.toEqual({
      title: 'Broken auth',
      summary: 'No description was provided.',
      sourceDisplayNumber: '#18',
      repositoryName: 'team/api',
    });

    await expect(
      issueRepositoryInternals.buildNewsFeedPredictionSnapshot({
        eventAction: 'updated',
        previous: new GithubIssue({
          id: 5,
          githubIssueNumber: 18,
          title: 'Broken auth',
          description: '',
          status: 'open',
        }),
        current: new GithubIssue({
          id: 5,
          githubIssueNumber: 18,
          title: 'Auth completely broken',
          description: 'More detail',
          status: 'closed',
        }),
      }),
    ).resolves.toEqual({
      title: 'Auth completely broken',
      summary:
        'Title changed to "Auth completely broken". Status changed from OPEN to CLOSED. Description was added.',
      sourceDisplayNumber: '#18',
      repositoryName: 'team/api',
    });

    expect(
      await issueRepositoryInternals.shouldEnqueueNewsFeedUpdate(
        new GithubIssue({
          title: 'A',
          description: 'desc',
          status: 'open',
        }),
        new GithubIssue({
          title: 'A',
          description: 'desc',
          status: 'open',
        }),
        {},
      ),
    ).toBe(false);

    const pullRequestRepository = new GithubPullRequestRepository(
      dataSource as never,
      {} as never,
      async () => ({}) as never,
      async () => ({}) as never,
      async () => ({}) as never,
    );
    const pullRequestRepositoryInternals =
      pullRequestRepository as unknown as PullRequestRepositoryNewsFeedInternals;
    pullRequestRepositoryInternals.repository = vi.fn().mockResolvedValue({
      workspaceId: 7,
      fullName: 'team/api',
    }) as never;

    await expect(
      pullRequestRepositoryInternals.buildNewsFeedPredictionSnapshot({
        eventAction: 'updated',
        previous: new GithubPullRequest({
          id: 8,
          githubPrNumber: 21,
          title: 'Feature',
          description: 'Old',
          status: 'open',
        }),
        current: new GithubPullRequest({
          id: 8,
          githubPrNumber: 21,
          title: 'Feature',
          description: '',
          status: 'merged',
        }),
      }),
    ).resolves.toEqual({
      title: 'Feature',
      summary: 'Status changed from OPEN to MERGED. Description was removed.',
      sourceDisplayNumber: '#21',
      repositoryName: 'team/api',
    });

    expect(
      await pullRequestRepositoryInternals.shouldEnqueueNewsFeedUpdate(
        new GithubPullRequest({
          title: 'A',
          description: 'desc',
          status: 'open',
        }),
        new GithubPullRequest({
          title: 'B',
          description: 'desc',
          status: 'open',
        }),
        {},
      ),
    ).toBe(true);
  });

  it('builds workspace member and capacity plan snapshots and keeps updates disabled', async () => {
    const workspaceMemberRepository = new WorkspaceMemberRepository(
      dataSource as never,
      {} as never,
      async () => ({}) as never,
      async () => ({}) as never,
    );
    const workspaceMemberRepositoryInternals =
      workspaceMemberRepository as unknown as WorkspaceMemberRepositoryNewsFeedInternals;
    workspaceMemberRepositoryInternals.user = vi.fn().mockResolvedValue({
      fullName: 'Alex Thompson',
    }) as never;
    workspaceMemberRepositoryInternals.workspace = vi.fn().mockResolvedValue({
      name: 'Delivery',
    }) as never;

    await expect(
      workspaceMemberRepositoryInternals.buildNewsFeedPredictionSnapshot({
        eventAction: 'created',
        current: new WorkspaceMember({
          id: 12,
          userId: 4,
          workspaceId: 7,
          role: 'ADMIN',
        }),
      }),
    ).resolves.toEqual({
      title: 'Alex Thompson joined the workspace',
      summary: 'Alex Thompson was added to Delivery as ADMIN.',
    });
    await expect(
      workspaceMemberRepositoryInternals.shouldEnqueueNewsFeedUpdate(),
    ).resolves.toBe(false);

    const capacityPlanRepository = new CapacityPlanRepository(
      dataSource as never,
      {} as never,
      async () => ({}) as never,
      async () => ({}) as never,
      async () => ({}) as never,
    );
    const capacityPlanRepositoryInternals =
      capacityPlanRepository as unknown as CapacityPlanRepositoryNewsFeedInternals;
    capacityPlanRepositoryInternals.workspace = vi.fn().mockResolvedValue({
      name: 'Delivery',
    }) as never;

    await expect(
      capacityPlanRepositoryInternals.buildNewsFeedPredictionSnapshot({
        eventAction: 'created',
        current: new CapacityPlan({
          id: 5,
          workspaceId: 7,
          start: '2026-04-13T08:00:00.000Z',
          end: '2026-04-17T17:00:00.000Z',
        }),
      }),
    ).resolves.toEqual({
      title: 'Capacity plan created for Delivery',
      summary: 'Capacity plan covering 2026-04-13 to 2026-04-17 was created.',
    });
    await expect(
      capacityPlanRepositoryInternals.shouldEnqueueNewsFeedUpdate(),
    ).resolves.toBe(false);
  });
});
