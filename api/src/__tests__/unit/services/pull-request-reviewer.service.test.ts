import {beforeEach, describe, expect, it, vi} from 'vitest';
import {PullRequestReviewerService} from '../../../services';

describe('PullRequestReviewerService (unit)', () => {
  let pullRequestRepository: Record<string, ReturnType<typeof vi.fn>>;
  let reviewerRepository: Record<string, ReturnType<typeof vi.fn>>;
  let userRepository: Record<string, ReturnType<typeof vi.fn>>;
  let githubRepositoryRepository: Record<string, ReturnType<typeof vi.fn>>;
  let auditEventService: Record<string, ReturnType<typeof vi.fn>>;
  let service: PullRequestReviewerService;

  beforeEach(() => {
    pullRequestRepository = {
      findOne: vi
        .fn()
        .mockResolvedValue({id: 12, repositoryId: 4, githubPrNumber: 18}),
    };
    reviewerRepository = {
      findOne: vi.fn().mockResolvedValue(null),
      find: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({id: 1}),
      updateById: vi.fn().mockResolvedValue(undefined),
      deleteById: vi.fn().mockResolvedValue(undefined),
    };
    userRepository = {
      findOne: vi.fn().mockResolvedValue({id: 9}),
    };
    githubRepositoryRepository = {
      findById: vi.fn().mockResolvedValue({
        id: 4,
        workspaceId: 3,
        fullName: 'team/api',
      }),
    };
    auditEventService = {
      record: vi.fn().mockResolvedValue(undefined),
    };
    service = new PullRequestReviewerService(
      pullRequestRepository as never,
      reviewerRepository as never,
      userRepository as never,
      githubRepositoryRepository as never,
      auditEventService as never,
    );
  });

  it('creates pending reviewer assignments and removes stale pending requests', async () => {
    reviewerRepository.find
      .mockResolvedValueOnce([
        {
          id: 2,
          pullRequestId: 12,
          githubLogin: 'old-reviewer',
          status: 'pending',
        },
      ])
      .mockResolvedValue([]);

    await service.syncRequestedReviewers({
      pullRequest: {id: 12, repositoryId: 4, githubPrNumber: 18} as never,
      reviewers: [{id: 111, login: 'octocat'}],
    });

    expect(userRepository.findOne).toHaveBeenCalledWith({
      where: {githubId: 111},
    });
    expect(reviewerRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        pullRequestId: 12,
        userId: 9,
        githubUserId: 111,
        githubLogin: 'octocat',
        status: 'pending',
      }),
    );
    expect(reviewerRepository.deleteById).toHaveBeenCalledWith(2);
    expect(auditEventService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 3,
        action: 'pull-request.reviewer.requested',
        resourceType: 'pull-request-reviewer',
        source: 'github',
      }),
    );
    expect(auditEventService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 3,
        action: 'pull-request.reviewer.removed',
        resourceId: '2',
      }),
    );
  });

  it('updates existing pending reviewer assignments instead of creating duplicates', async () => {
    reviewerRepository.findOne.mockResolvedValueOnce({
      id: 7,
      pullRequestId: 12,
      githubLogin: 'octocat',
      status: 'pending',
    });
    reviewerRepository.find.mockResolvedValueOnce([
      {
        id: 7,
        pullRequestId: 12,
        githubLogin: 'octocat',
        status: 'pending',
      },
    ]);

    await service.syncRequestedReviewers({
      pullRequest: {id: 12, repositoryId: 4, githubPrNumber: 18} as never,
      reviewers: [{id: 111, login: ' octocat '}],
    });

    expect(reviewerRepository.create).not.toHaveBeenCalled();
    expect(reviewerRepository.updateById).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        pullRequestId: 12,
        userId: 9,
        githubUserId: 111,
        githubLogin: 'octocat',
      }),
    );
    expect(reviewerRepository.deleteById).not.toHaveBeenCalled();
    expect(auditEventService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'pull-request.reviewer.updated',
        resourceId: '7',
      }),
    );
  });

  it('ignores reviewer entries without a login', async () => {
    await service.syncRequestedReviewers({
      pullRequest: {id: 12} as never,
      reviewers: [{id: 111, login: '   '}, {id: 222}],
    });

    expect(userRepository.findOne).not.toHaveBeenCalled();
    expect(reviewerRepository.create).not.toHaveBeenCalled();
    expect(reviewerRepository.find).toHaveBeenCalledWith({
      where: {pullRequestId: 12, status: 'pending'},
    });
  });

  it('marks reviewer progress for an existing assignment', async () => {
    reviewerRepository.findOne.mockResolvedValueOnce({id: 44});

    await service.markProgress({
      repositoryId: 4,
      pullRequestNumber: 18,
      reviewer: {id: 111, login: 'octocat'},
      status: 'approved',
    });

    expect(pullRequestRepository.findOne).toHaveBeenCalledWith({
      where: {repositoryId: 4, githubPrNumber: 18},
    });
    expect(reviewerRepository.updateById).toHaveBeenCalledWith(
      44,
      expect.objectContaining({
        pullRequestId: 12,
        githubLogin: 'octocat',
        status: 'approved',
      }),
    );
    expect(auditEventService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'pull-request.reviewer.progressed',
        resourceId: '44',
        payload: expect.objectContaining({status: 'approved'}),
      }),
    );
  });

  it('creates progress records when review activity arrives before a pending assignment sync', async () => {
    reviewerRepository.findOne.mockResolvedValueOnce(null);

    await service.markProgress({
      repositoryId: 4,
      pullRequestNumber: 18,
      reviewer: {id: 111, login: 'octocat'},
      status: 'commented',
    });

    expect(reviewerRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        pullRequestId: 12,
        userId: 9,
        githubUserId: 111,
        githubLogin: 'octocat',
        status: 'commented',
        reviewedAt: expect.any(String),
      }),
    );
  });

  it('skips progress updates without a reviewer login or local pull request', async () => {
    await service.markProgress({
      repositoryId: 4,
      pullRequestNumber: 18,
      reviewer: {id: 111, login: '   '},
      status: 'approved',
    });

    expect(pullRequestRepository.findOne).not.toHaveBeenCalled();
    expect(reviewerRepository.create).not.toHaveBeenCalled();

    pullRequestRepository.findOne.mockResolvedValueOnce(null);

    await service.markProgress({
      repositoryId: 4,
      pullRequestNumber: 18,
      reviewer: {id: 111, login: 'octocat'},
      status: 'approved',
    });

    expect(reviewerRepository.create).not.toHaveBeenCalled();
    expect(reviewerRepository.updateById).not.toHaveBeenCalled();
  });

  it('keeps reviewer user id nullable when GitHub user id is missing or unmapped', async () => {
    userRepository.findOne.mockResolvedValueOnce(null);

    await service.markProgress({
      repositoryId: 4,
      pullRequestNumber: 18,
      reviewer: {id: 999, login: 'unknown-user'},
      status: 'dismissed',
    });

    expect(reviewerRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: null,
        githubUserId: 999,
        githubLogin: 'unknown-user',
      }),
    );

    reviewerRepository.create.mockClear();
    await service.markProgress({
      repositoryId: 4,
      pullRequestNumber: 18,
      reviewer: {login: 'login-only'},
      status: 'dismissed',
    });

    expect(reviewerRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: null,
        githubUserId: null,
        githubLogin: 'login-only',
      }),
    );
  });
});
