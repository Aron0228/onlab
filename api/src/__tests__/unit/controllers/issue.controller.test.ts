import {beforeEach, describe, expect, it, vi} from 'vitest';

import {GithubIssueController} from '../../../controllers/github/issue.controller';

describe('GithubIssueController (unit)', () => {
  let githubIssueRepository: object;
  let issueService: {
    deleteById: ReturnType<typeof vi.fn>;
    deleteAll: ReturnType<typeof vi.fn>;
  };
  let controller: GithubIssueController;

  beforeEach(() => {
    githubIssueRepository = {};
    issueService = {
      deleteById: vi.fn().mockResolvedValue(undefined),
      deleteAll: vi.fn().mockResolvedValue({count: 2}),
    };

    controller = new GithubIssueController(
      githubIssueRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      issueService as never,
      {} as never,
    );
  });

  it('deletes a single issue through IssueService', async () => {
    await expect(controller.deleteById(7)).resolves.toBeUndefined();
    expect(issueService.deleteById).toHaveBeenCalledWith(7);
  });

  it('deletes matching issues through IssueService', async () => {
    const where = {repositoryId: 3} as never;

    await expect(controller.deleteAll(where)).resolves.toEqual({count: 2});
    expect(issueService.deleteAll).toHaveBeenCalledWith(where);
  });

  it('still supports priority analysis for issue drafts', async () => {
    const priorityService = {
      predictIssuePriority: vi.fn().mockResolvedValue({
        priority: 'High',
        reason: 'Blocks the release',
      }),
    };
    const repositoryRepository = {
      findById: vi.fn().mockResolvedValue({workspaceId: 9}),
    };
    const workspaceRepository = {
      findById: vi.fn().mockResolvedValue({githubInstallationId: 11}),
    };
    const controllerWithDeps = new GithubIssueController(
      githubIssueRepository as never,
      repositoryRepository as never,
      workspaceRepository as never,
      {} as never,
      priorityService as never,
      issueService as never,
      {} as never,
    );

    await expect(
      controllerWithDeps.analyzePriority({
        repositoryId: 4,
        title: 'Broken sign-in',
        description: 'Users cannot log in',
      }),
    ).resolves.toEqual({
      priority: 'High',
      reason: 'Blocks the release',
    });
    expect(priorityService.predictIssuePriority).toHaveBeenCalledWith({
      title: 'Broken sign-in',
      description: 'Users cannot log in',
    });
  });
});
