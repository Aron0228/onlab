import {beforeEach, describe, expect, it, vi} from 'vitest';

import {GithubPullRequestController} from '../../../controllers/github/pull-request.controller';
import {GithubPullRequest} from '../../../models';

describe('GithubPullRequestController (unit)', () => {
  let pullRequestRepository: {
    find: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    updateById: ReturnType<typeof vi.fn>;
    replaceById: ReturnType<typeof vi.fn>;
  };
  let repositoryRepository: {
    find: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
  };
  let pullRequestService: {deleteById: ReturnType<typeof vi.fn>};
  let authorization: {
    getAuthenticatedUserId: ReturnType<typeof vi.fn>;
    accessibleWorkspaceIds: ReturnType<typeof vi.fn>;
    assertWorkspaceMember: ReturnType<typeof vi.fn>;
    assertWorkspaceAdminOrOwner: ReturnType<typeof vi.fn>;
  };
  let controller: GithubPullRequestController;

  beforeEach(() => {
    pullRequestRepository = {
      find: vi.fn(),
      count: vi.fn(),
      findById: vi.fn(),
      updateById: vi.fn().mockResolvedValue(undefined),
      replaceById: vi.fn().mockResolvedValue(undefined),
    };
    repositoryRepository = {
      find: vi.fn().mockResolvedValue([{id: 8, workspaceId: 4}]),
      findById: vi.fn().mockResolvedValue({id: 8, workspaceId: 4}),
    };
    pullRequestService = {
      deleteById: vi.fn().mockResolvedValue(undefined),
    };
    authorization = {
      getAuthenticatedUserId: vi.fn().mockReturnValue(7),
      accessibleWorkspaceIds: vi.fn().mockResolvedValue([4]),
      assertWorkspaceMember: vi.fn().mockResolvedValue('MEMBER'),
      assertWorkspaceAdminOrOwner: vi.fn().mockResolvedValue('ADMIN'),
    };

    controller = new GithubPullRequestController(
      pullRequestRepository as never,
      repositoryRepository as never,
      pullRequestService as never,
      authorization as never,
    );
  });

  it('scopes pull request lists to accessible repositories', async () => {
    const pullRequest = new GithubPullRequest({id: 5, repositoryId: 8});
    pullRequestRepository.find.mockResolvedValue([pullRequest]);

    await expect(
      controller.find({id: 7} as never, {
        include: ['aiPrediction'],
        limit: 25,
        skip: 50,
        order: ['id DESC'],
        where: {status: 'open'},
      }),
    ).resolves.toEqual([pullRequest]);

    expect(pullRequestRepository.find).toHaveBeenCalledWith({
      include: ['aiPrediction'],
      limit: 25,
      skip: 50,
      order: ['id DESC'],
      where: {
        and: [{status: 'open'}, {repositoryId: {inq: [8]}}],
      },
    });
  });

  it('deletes pull requests through PullRequestService after admin check', async () => {
    pullRequestRepository.findById.mockResolvedValue(
      new GithubPullRequest({id: 5, repositoryId: 8}),
    );

    await expect(
      controller.deleteById({id: 7} as never, 5),
    ).resolves.toBeUndefined();
    expect(authorization.assertWorkspaceAdminOrOwner).toHaveBeenCalledWith(
      4,
      7,
    );
    expect(pullRequestService.deleteById).toHaveBeenCalledWith(5);
  });

  it('covers pull request counts, single reads, relations, and updates', async () => {
    pullRequestRepository.count.mockResolvedValue({count: 1});
    pullRequestRepository.findById.mockResolvedValue({
      id: 5,
      repositoryId: 8,
      author: {id: 7},
    });

    await expect(
      controller.count({id: 7} as never, {status: 'open'}),
    ).resolves.toEqual({count: 1});
    await expect(
      controller.findById({id: 7} as never, 5),
    ).resolves.toMatchObject({
      id: 5,
    });
    await expect(
      controller.getRelation({id: 7} as never, 5, 'author'),
    ).resolves.toEqual({id: 7});
    await expect(
      controller.updateById({id: 7} as never, 5, {status: 'merged'}),
    ).resolves.toBeUndefined();
    await expect(
      controller.replaceById({id: 7} as never, 5, {
        repositoryId: 8,
        githubPrNumber: 13,
        title: 'Update auth',
        status: 'open',
        description: 'Auth changes',
      }),
    ).resolves.toBeUndefined();
    await expect(controller.deleteAll()).resolves.toEqual({count: 0});

    expect(pullRequestRepository.count).toHaveBeenCalledWith({
      and: [{status: 'open'}, {repositoryId: {inq: [8]}}],
    });
    expect(authorization.assertWorkspaceMember).toHaveBeenCalledWith(4, 7);
    expect(pullRequestRepository.updateById).toHaveBeenCalledWith(5, {
      status: 'merged',
    });
    expect(pullRequestRepository.replaceById).toHaveBeenCalled();
  });
});
