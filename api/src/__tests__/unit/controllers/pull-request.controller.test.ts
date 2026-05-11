import {beforeEach, describe, expect, it, vi} from 'vitest';

import {GithubPullRequestController} from '../../../controllers/github/pull-request.controller';
import {GithubPullRequest} from '../../../models';

describe('GithubPullRequestController (unit)', () => {
  let pullRequestRepository: {
    find: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
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
      findById: vi.fn(),
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
      controller.find({id: 7} as never, {where: {status: 'open'}}),
    ).resolves.toEqual([pullRequest]);

    expect(pullRequestRepository.find).toHaveBeenCalledWith({
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
});
