import {beforeEach, describe, expect, it, vi} from 'vitest';

import {GithubPullRequestController} from '../../../controllers/github/pull-request.controller';

describe('GithubPullRequestController (unit)', () => {
  let pullRequestService: {
    deleteById: ReturnType<typeof vi.fn>;
    deleteAll: ReturnType<typeof vi.fn>;
  };
  let controller: GithubPullRequestController;

  beforeEach(() => {
    pullRequestService = {
      deleteById: vi.fn().mockResolvedValue(undefined),
      deleteAll: vi.fn().mockResolvedValue({count: 3}),
    };

    controller = new GithubPullRequestController(
      {} as never,
      pullRequestService as never,
    );
  });

  it('deletes a single pull request through PullRequestService', async () => {
    await expect(controller.deleteById(5)).resolves.toBeUndefined();
    expect(pullRequestService.deleteById).toHaveBeenCalledWith(5);
  });

  it('deletes matching pull requests through PullRequestService', async () => {
    const where = {repositoryId: 8} as never;

    await expect(controller.deleteAll(where)).resolves.toEqual({count: 3});
    expect(pullRequestService.deleteAll).toHaveBeenCalledWith(where);
  });
});
