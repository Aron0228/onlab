import {beforeEach, describe, expect, it, vi} from 'vitest';
import {HttpErrors} from '@loopback/rest';

import {GithubIssueController} from '../../../controllers/github/issue.controller';
import {GithubIssue} from '../../../models';
import type {IssuePriorityPrediction} from '../../../services';

describe('GithubIssueController (unit)', () => {
  let issueRepository: {
    find: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
  };
  let repositoryRepository: {
    find: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
  };
  let workspaceRepository: {findById: ReturnType<typeof vi.fn>};
  let issueService: {deleteById: ReturnType<typeof vi.fn>};
  let priorityService: {
    predictIssuePriority: ReturnType<typeof vi.fn>;
    normalizePredictionInput: ReturnType<typeof vi.fn>;
  };
  let queueService: {enqueueGithubIssueCreation: ReturnType<typeof vi.fn>};
  let authorization: {
    getAuthenticatedUserId: ReturnType<typeof vi.fn>;
    accessibleWorkspaceIds: ReturnType<typeof vi.fn>;
    assertWorkspaceMember: ReturnType<typeof vi.fn>;
    assertWorkspaceAdminOrOwner: ReturnType<typeof vi.fn>;
  };
  let controller: GithubIssueController;

  beforeEach(() => {
    issueRepository = {
      find: vi.fn(),
      findById: vi.fn(),
    };
    repositoryRepository = {
      find: vi.fn().mockResolvedValue([{id: 4, workspaceId: 9}]),
      findById: vi
        .fn()
        .mockResolvedValue({id: 4, workspaceId: 9, fullName: 'team/api'}),
    };
    workspaceRepository = {
      findById: vi.fn().mockResolvedValue({githubInstallationId: 11}),
    };
    issueService = {
      deleteById: vi.fn().mockResolvedValue(undefined),
    };
    priorityService = {
      predictIssuePriority: vi.fn().mockResolvedValue({
        priority: 'High',
        reason: 'Blocks the release',
        estimatedHours: 8,
        estimationConfidence: 'medium',
      }),
      normalizePredictionInput: vi.fn().mockImplementation(prediction =>
        prediction
          ? {
              priority: prediction.priority,
              reason: prediction.reason,
              estimatedHours: prediction.estimatedHours ?? null,
              estimationConfidence: prediction.estimationConfidence ?? null,
            }
          : null,
      ),
    };
    queueService = {
      enqueueGithubIssueCreation: vi.fn().mockResolvedValue({
        id: 'create-issue:4:broken-sign-in',
      }),
    };
    authorization = {
      getAuthenticatedUserId: vi.fn().mockReturnValue(7),
      accessibleWorkspaceIds: vi.fn().mockResolvedValue([9]),
      assertWorkspaceMember: vi.fn().mockResolvedValue('MEMBER'),
      assertWorkspaceAdminOrOwner: vi.fn().mockResolvedValue('ADMIN'),
    };

    controller = new GithubIssueController(
      issueRepository as never,
      repositoryRepository as never,
      workspaceRepository as never,
      {} as never,
      priorityService as never,
      issueService as never,
      queueService as never,
      authorization as never,
    );
  });

  it('scopes issue lists to repositories in accessible workspaces', async () => {
    const issue = new GithubIssue({id: 7, repositoryId: 4, title: 'Bug'});
    issueRepository.find.mockResolvedValue([issue]);

    await expect(
      controller.find({id: 7} as never, {where: {status: 'open'}}),
    ).resolves.toEqual([issue]);

    expect(issueRepository.find).toHaveBeenCalledWith({
      where: {
        and: [{status: 'open'}, {repositoryId: {inq: [4]}}],
      },
    });
  });

  it('deletes a single issue through IssueService after admin check', async () => {
    issueRepository.findById.mockResolvedValue(
      new GithubIssue({id: 7, repositoryId: 4}),
    );

    await expect(
      controller.deleteById({id: 7} as never, 7),
    ).resolves.toBeUndefined();
    expect(authorization.assertWorkspaceAdminOrOwner).toHaveBeenCalledWith(
      9,
      7,
    );
    expect(issueService.deleteById).toHaveBeenCalledWith(7);
  });

  it('supports priority analysis for issue drafts', async () => {
    await expect(
      controller.analyzePriority({id: 7} as never, {
        repositoryId: 4,
        title: 'Broken sign-in',
        description: 'Users cannot log in',
      }),
    ).resolves.toEqual({
      priority: 'High',
      reason: 'Blocks the release',
      estimatedHours: 8,
      estimationConfidence: 'medium',
    });
    expect(priorityService.predictIssuePriority).toHaveBeenCalledWith({
      installationId: 11,
      repositoryFullName: 'team/api',
      workspaceId: 9,
      title: 'Broken sign-in',
      description: 'Users cannot log in',
    });
  });

  it('rejects priority analysis before calling AI when the user cannot access the repository workspace', async () => {
    authorization.assertWorkspaceMember.mockRejectedValueOnce(
      new HttpErrors.Forbidden('You are not a member of this workspace.'),
    );

    await expect(
      controller.analyzePriority({id: 7} as never, {
        repositoryId: 4,
        title: 'Broken sign-in',
        description: 'Users cannot log in',
      }),
    ).rejects.toBeInstanceOf(HttpErrors.Forbidden);

    expect(priorityService.predictIssuePriority).not.toHaveBeenCalled();
  });

  it('queues issue creation with the already analyzed prediction', async () => {
    const prediction: IssuePriorityPrediction = {
      priority: 'High',
      reason: 'Blocks the release',
      estimatedHours: 8,
      estimationConfidence: 'medium',
    };

    await expect(
      controller.createWithPriority({id: 7} as never, {
        repositoryId: 4,
        title: 'Broken sign-in',
        description: 'Users cannot log in',
        prediction,
      }),
    ).resolves.toEqual({
      queued: true,
      jobId: 'create-issue:4:broken-sign-in',
    });

    expect(priorityService.normalizePredictionInput).toHaveBeenCalledWith(
      prediction,
    );
    expect(queueService.enqueueGithubIssueCreation).toHaveBeenCalledWith({
      repositoryId: 4,
      title: 'Broken sign-in',
      description: 'Users cannot log in',
      prediction,
    });
  });

  it('does not queue issue creation when the user cannot access the repository workspace', async () => {
    authorization.assertWorkspaceMember.mockRejectedValueOnce(
      new HttpErrors.Forbidden('You are not a member of this workspace.'),
    );

    await expect(
      controller.createWithPriority({id: 7} as never, {
        repositoryId: 4,
        title: 'Broken sign-in',
        description: 'Users cannot log in',
      }),
    ).rejects.toBeInstanceOf(HttpErrors.Forbidden);

    expect(priorityService.normalizePredictionInput).not.toHaveBeenCalled();
    expect(queueService.enqueueGithubIssueCreation).not.toHaveBeenCalled();
  });
});
