import {beforeEach, describe, expect, it, vi} from 'vitest';
import {PullRequestReviewerService} from '../../../services';

describe('PullRequestReviewerService (unit)', () => {
  let pullRequestRepository: Record<string, ReturnType<typeof vi.fn>>;
  let reviewerRepository: Record<string, ReturnType<typeof vi.fn>>;
  let userRepository: Record<string, ReturnType<typeof vi.fn>>;
  let service: PullRequestReviewerService;

  beforeEach(() => {
    pullRequestRepository = {
      findOne: vi.fn().mockResolvedValue({id: 12}),
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
    service = new PullRequestReviewerService(
      pullRequestRepository as never,
      reviewerRepository as never,
      userRepository as never,
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
      pullRequest: {id: 12} as never,
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
  });
});
