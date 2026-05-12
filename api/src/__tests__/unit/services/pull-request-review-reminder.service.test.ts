import {beforeEach, describe, expect, it, vi} from 'vitest';
import {PullRequestReviewReminderService} from '../../../services';

describe('PullRequestReviewReminderService (unit)', () => {
  let repositoryRepository: Record<string, ReturnType<typeof vi.fn>>;
  let pullRequestRepository: Record<string, ReturnType<typeof vi.fn>>;
  let reviewerRepository: Record<string, ReturnType<typeof vi.fn>>;
  let userRepository: Record<string, ReturnType<typeof vi.fn>>;
  let socketService: Record<string, ReturnType<typeof vi.fn>>;
  let notificationService: Record<string, ReturnType<typeof vi.fn>>;
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
      updateAll: vi.fn().mockResolvedValue({count: 1}),
    };
    userRepository = {
      findOne: vi.fn().mockResolvedValue({id: 12}),
    };
    socketService = {
      emitPullRequestReviewReminder: vi.fn(),
    };
    notificationService = {
      create: vi.fn().mockResolvedValue({id: 44}),
    };
    service = new PullRequestReviewReminderService(
      repositoryRepository as never,
      pullRequestRepository as never,
      reviewerRepository as never,
      userRepository as never,
      socketService as never,
      notificationService as never,
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
        notificationId: 44,
      },
    );
    expect(reviewerRepository.updateAll).toHaveBeenCalledWith(
      expect.objectContaining({
        lastNotifiedAt: expect.any(String),
        userId: 12,
      }),
      expect.objectContaining({
        id: 8,
        status: 'pending',
      }),
    );
    expect(notificationService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 12,
        workspaceId: 7,
        type: 'pull-request-review-reminder',
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

  it('falls back to reviewer login when GitHub id is not mapped', async () => {
    reviewerRepository.find.mockResolvedValueOnce([
      {
        id: 8,
        pullRequestId: 5,
        userId: null,
        githubUserId: 1234,
        githubLogin: 'octocat',
      },
    ]);
    userRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({id: 14});

    await expect(service.remindWorkspace(7)).resolves.toBe(1);

    expect(userRepository.findOne).toHaveBeenNthCalledWith(1, {
      where: {githubId: 1234},
    });
    expect(userRepository.findOne).toHaveBeenNthCalledWith(2, {
      where: {username: 'octocat'},
    });
    expect(socketService.emitPullRequestReviewReminder).toHaveBeenCalledWith(
      14,
      expect.any(Object),
    );
  });

  it('does not emit reminders when the workspace has no repositories', async () => {
    repositoryRepository.find.mockResolvedValueOnce([]);

    await expect(service.remindWorkspace(7)).resolves.toBe(0);
    expect(socketService.emitPullRequestReviewReminder).not.toHaveBeenCalled();
  });

  it('does not emit reminders when there are no open pull requests', async () => {
    pullRequestRepository.find.mockResolvedValueOnce([]);

    await expect(service.remindWorkspace(7)).resolves.toBe(0);

    expect(reviewerRepository.find).not.toHaveBeenCalled();
    expect(socketService.emitPullRequestReviewReminder).not.toHaveBeenCalled();
  });

  it('skips pending reviewers without a resolvable local user', async () => {
    reviewerRepository.find.mockResolvedValueOnce([
      {
        id: 8,
        pullRequestId: 5,
        userId: null,
        githubUserId: null,
        githubLogin: null,
      },
    ]);

    await expect(service.remindWorkspace(7)).resolves.toBe(0);

    expect(socketService.emitPullRequestReviewReminder).not.toHaveBeenCalled();
    expect(reviewerRepository.updateAll).not.toHaveBeenCalled();
  });

  it('skips orphaned pending reviewers without a matching open pull request', async () => {
    reviewerRepository.find.mockResolvedValueOnce([
      {
        id: 8,
        pullRequestId: 999,
        userId: 12,
        githubLogin: 'octocat',
      },
    ]);

    await expect(service.remindWorkspace(7)).resolves.toBe(0);

    expect(socketService.emitPullRequestReviewReminder).not.toHaveBeenCalled();
    expect(reviewerRepository.updateAll).not.toHaveBeenCalled();
  });

  it('skips pending reviewers whose pull request repository is missing', async () => {
    pullRequestRepository.find.mockResolvedValueOnce([
      {
        id: 5,
        repositoryId: 999,
        githubPrNumber: 37,
        title: 'Refactor scheduler',
        status: 'open',
      },
    ]);

    await expect(service.remindWorkspace(7)).resolves.toBe(0);

    expect(socketService.emitPullRequestReviewReminder).not.toHaveBeenCalled();
    expect(reviewerRepository.updateAll).not.toHaveBeenCalled();
  });

  it('prevents overlapping reminder runs for the same workspace', async () => {
    let releaseFind: () => void = () => {};
    repositoryRepository.find.mockReturnValueOnce(
      new Promise(resolve => {
        releaseFind = () =>
          resolve([{id: 2, workspaceId: 7, fullName: 'team/api'}]);
      }),
    );

    const firstRun = service.remindWorkspace(7);

    await expect(service.remindWorkspace(7)).resolves.toBe(0);

    releaseFind();
    await expect(firstRun).resolves.toBe(1);
  });
});
