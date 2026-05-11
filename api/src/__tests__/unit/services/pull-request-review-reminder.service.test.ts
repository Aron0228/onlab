import {beforeEach, describe, expect, it, vi} from 'vitest';
import {PullRequestReviewReminderService} from '../../../services';

describe('PullRequestReviewReminderService (unit)', () => {
  let repositoryRepository: Record<string, ReturnType<typeof vi.fn>>;
  let pullRequestRepository: Record<string, ReturnType<typeof vi.fn>>;
  let reviewerRepository: Record<string, ReturnType<typeof vi.fn>>;
  let userRepository: Record<string, ReturnType<typeof vi.fn>>;
  let socketService: Record<string, ReturnType<typeof vi.fn>>;
  let service: PullRequestReviewReminderService;

  beforeEach(() => {
    repositoryRepository = {
      find: vi.fn().mockResolvedValue([
        {
          id: 2,
          workspaceId: 7,
          fullName: 'team/api',
        },
      ]),
    };
    pullRequestRepository = {
      find: vi.fn().mockResolvedValue([
        {
          id: 5,
          repositoryId: 2,
          githubPrNumber: 37,
          title: 'Refactor scheduler',
          status: 'open',
        },
      ]),
    };
    reviewerRepository = {
      find: vi.fn().mockResolvedValue([
        {
          id: 8,
          pullRequestId: 5,
          userId: 12,
          githubLogin: 'octocat',
        },
      ]),
      updateById: vi.fn().mockResolvedValue(undefined),
    };
    userRepository = {
      findOne: vi.fn().mockResolvedValue({id: 12}),
    };
    socketService = {
      emitPullRequestReviewReminder: vi.fn(),
    };
    service = new PullRequestReviewReminderService(
      repositoryRepository as never,
      pullRequestRepository as never,
      reviewerRepository as never,
      userRepository as never,
      socketService as never,
    );
  });

  it('emits reminders to pending reviewers and stores notification time', async () => {
    const count = await service.remindWorkspace(7);

    expect(count).toBe(1);
    expect(socketService.emitPullRequestReviewReminder).toHaveBeenCalledWith(
      12,
      {
        workspaceId: 7,
        pullRequestId: 5,
        pullRequestNumber: 37,
        pullRequestTitle: 'Refactor scheduler',
        repositoryName: 'team/api',
        reviewerLogin: 'octocat',
      },
    );
    expect(reviewerRepository.updateById).toHaveBeenCalledWith(
      8,
      expect.objectContaining({
        lastNotifiedAt: expect.any(String),
        userId: 12,
      }),
    );
  });

  it('resolves stale reviewer rows without a stored local user id', async () => {
    reviewerRepository.find.mockResolvedValueOnce([
      {
        id: 8,
        pullRequestId: 5,
        userId: null,
        githubUserId: 1234,
        githubLogin: 'octocat',
      },
    ]);

    await expect(service.remindWorkspace(7)).resolves.toBe(1);

    expect(userRepository.findOne).toHaveBeenCalledWith({
      where: {githubId: 1234},
    });
    expect(socketService.emitPullRequestReviewReminder).toHaveBeenCalledWith(
      12,
      expect.any(Object),
    );
  });

  it('does not emit reminders when the workspace has no repositories', async () => {
    repositoryRepository.find.mockResolvedValueOnce([]);

    await expect(service.remindWorkspace(7)).resolves.toBe(0);
    expect(socketService.emitPullRequestReviewReminder).not.toHaveBeenCalled();
  });
});
