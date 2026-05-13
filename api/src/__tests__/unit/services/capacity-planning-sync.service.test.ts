import {describe, expect, it, vi, beforeEach} from 'vitest';

import {IssueAssignment} from '../../../models';
import {CapacityPlanningSyncService} from '../../../services/capacity-planning-sync.service';

describe('CapacityPlanningSyncService (unit)', () => {
  let capacityPlanRepository: {
    findById: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
  };
  let githubIssueRepository: {
    findById: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
  };
  let githubRepositoryRepository: {findById: ReturnType<typeof vi.fn>};
  let issueAssignmentRepository: {
    findOne: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    deleteById: ReturnType<typeof vi.fn>;
  };
  let userRepository: {
    findById: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
  };
  let workspaceRepository: {findById: ReturnType<typeof vi.fn>};
  let githubService: {setIssueAssignees: ReturnType<typeof vi.fn>};
  let auditEventService: {record: ReturnType<typeof vi.fn>};
  let service: CapacityPlanningSyncService;

  beforeEach(() => {
    capacityPlanRepository = {
      findById: vi.fn().mockResolvedValue({id: 8, workspaceId: 3}),
      findOne: vi.fn().mockResolvedValue({id: 8, workspaceId: 3}),
    };
    githubIssueRepository = {
      findById: vi
        .fn()
        .mockResolvedValue({id: 11, repositoryId: 4, githubIssueNumber: 27}),
      findOne: vi.fn().mockResolvedValue({
        id: 11,
        repositoryId: 4,
        githubId: 22,
        githubIssueNumber: 27,
      }),
    };
    githubRepositoryRepository = {
      findById: vi.fn().mockResolvedValue({id: 4, fullName: 'team/api'}),
    };
    issueAssignmentRepository = {
      findOne: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({id: 19}),
      deleteById: vi.fn().mockResolvedValue(undefined),
    };
    userRepository = {
      findById: vi.fn().mockResolvedValue({
        id: 5,
        githubId: 111,
        username: 'octocat',
      }),
      findOne: vi.fn().mockResolvedValue({
        id: 5,
        githubId: 111,
        username: 'octocat',
      }),
    };
    workspaceRepository = {
      findById: vi.fn().mockResolvedValue({
        id: 3,
        githubInstallationId: '77',
        capacityPlanningSync: true,
      }),
    };
    githubService = {
      setIssueAssignees: vi.fn().mockResolvedValue(undefined),
    };
    auditEventService = {
      record: vi.fn().mockResolvedValue(undefined),
    };

    service = new CapacityPlanningSyncService(
      capacityPlanRepository as never,
      githubIssueRepository as never,
      githubRepositoryRepository as never,
      issueAssignmentRepository as never,
      userRepository as never,
      workspaceRepository as never,
      githubService as never,
      auditEventService as never,
    );
  });

  it('mirrors issue assignments to GitHub when workspace sync is enabled', async () => {
    await service.syncIssueAssignment(
      new IssueAssignment({
        id: 9,
        capacityPlanId: 8,
        issueId: 11,
        userId: 5,
        assignedHours: 6,
      }),
    );

    expect(githubService.setIssueAssignees).toHaveBeenCalledWith(
      77,
      'team/api',
      27,
      ['octocat'],
    );
    expect(auditEventService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 5,
        workspaceId: 3,
        action: 'capacity-planning.assignment.synced',
        resourceType: 'issue-assignment',
        resourceId: '9',
        source: 'system',
      }),
    );
  });

  it('skips GitHub updates when capacity planning sync is disabled', async () => {
    workspaceRepository.findById.mockResolvedValue({
      id: 3,
      githubInstallationId: '77',
      capacityPlanningSync: false,
    });

    await service.syncIssueAssignment(
      new IssueAssignment({
        capacityPlanId: 8,
        issueId: 11,
        userId: 5,
        assignedHours: 6,
      }),
    );

    expect(githubService.setIssueAssignees).not.toHaveBeenCalled();
    expect(auditEventService.record).not.toHaveBeenCalled();
  });

  it('skips GitHub updates when the workspace has no GitHub installation', async () => {
    workspaceRepository.findById.mockResolvedValue({
      id: 3,
      githubInstallationId: null,
      capacityPlanningSync: true,
    });

    await service.syncIssueAssignment(
      new IssueAssignment({
        capacityPlanId: 8,
        issueId: 11,
        userId: 5,
        assignedHours: 6,
      }),
    );

    expect(githubService.setIssueAssignees).not.toHaveBeenCalled();
    expect(auditEventService.record).not.toHaveBeenCalled();
  });

  it('imports GitHub assignee changes into the current capacity plan', async () => {
    capacityPlanRepository.findOne = vi.fn().mockResolvedValue({
      id: 8,
      workspaceId: 3,
    });
    githubRepositoryRepository.findById.mockResolvedValue({
      id: 4,
      workspaceId: 3,
      fullName: 'team/api',
    });
    githubIssueRepository.findOne = vi.fn().mockResolvedValue({
      id: 11,
      repositoryId: 4,
      githubId: 22,
      githubIssueNumber: 27,
      aiPrediction: {estimatedHours: 6},
    });

    await service.syncGithubIssueAssigneeChange({
      action: 'assigned',
      repositoryId: 4,
      githubIssueId: 22,
      githubIssueNumber: 27,
      assignee: {id: 111, login: 'octocat'},
    });

    expect(capacityPlanRepository.findOne).toHaveBeenCalledWith({
      where: {
        workspaceId: 3,
        start: {lte: expect.any(String)},
        end: {gte: expect.any(String)},
      },
      order: ['start DESC'],
    });
    expect(issueAssignmentRepository.create).toHaveBeenCalledWith({
      capacityPlanId: 8,
      issueId: 11,
      userId: 5,
      assignedHours: 6,
    });
    expect(auditEventService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 5,
        workspaceId: 3,
        action: 'capacity-planning.assignment.imported',
        resourceType: 'issue-assignment',
        resourceId: '19',
        source: 'github',
      }),
    );
  });

  it('ignores GitHub assignee changes when the assignee identity is missing', async () => {
    await service.syncGithubIssueAssigneeChange({
      action: 'assigned',
      repositoryId: 4,
      githubIssueId: 22,
      githubIssueNumber: 27,
      assignee: {login: '   '},
    });

    expect(githubRepositoryRepository.findById).not.toHaveBeenCalled();
    expect(githubIssueRepository.findOne).not.toHaveBeenCalled();
    expect(issueAssignmentRepository.create).not.toHaveBeenCalled();
  });

  it('skips incoming GitHub assignee sync when the issue is not stored locally', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    githubRepositoryRepository.findById.mockResolvedValue({
      id: 4,
      workspaceId: 3,
      fullName: 'team/api',
    });
    githubIssueRepository.findOne.mockResolvedValue(null);

    await service.syncGithubIssueAssigneeChange({
      action: 'assigned',
      repositoryId: 4,
      githubIssueId: 22,
      githubIssueNumber: 27,
      assignee: {id: 111, login: 'octocat'},
    });

    expect(warnSpy).toHaveBeenCalledWith(
      'Skipping GitHub assignee sync because the issue is not stored locally.',
      {
        repositoryId: 4,
        githubIssueId: 22,
        githubIssueNumber: 27,
      },
    );
    expect(workspaceRepository.findById).not.toHaveBeenCalled();
    expect(issueAssignmentRepository.create).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('falls back to login matching and the latest plan when importing GitHub assignments', async () => {
    capacityPlanRepository.findOne = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({id: 9, workspaceId: 3});
    githubRepositoryRepository.findById.mockResolvedValue({
      id: 4,
      workspaceId: 3,
      fullName: 'team/api',
    });
    githubIssueRepository.findOne.mockResolvedValue({
      id: 11,
      repositoryId: 4,
      githubId: 22,
      githubIssueNumber: 27,
    });
    userRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({id: 6, githubId: 222, username: 'fallback-user'});
    issueAssignmentRepository.create.mockResolvedValue({id: 20});

    await service.syncGithubIssueAssigneeChange({
      action: 'assigned',
      repositoryId: 4,
      githubIssueId: 22,
      githubIssueNumber: 27,
      assignee: {id: 222, login: 'fallback-user'},
    });

    expect(userRepository.findOne).toHaveBeenNthCalledWith(1, {
      where: {githubId: 222},
    });
    expect(userRepository.findOne).toHaveBeenNthCalledWith(2, {
      where: {username: 'fallback-user'},
    });
    expect(capacityPlanRepository.findOne).toHaveBeenNthCalledWith(2, {
      where: {workspaceId: 3},
      order: ['start DESC'],
    });
    expect(issueAssignmentRepository.create).toHaveBeenCalledWith({
      capacityPlanId: 9,
      issueId: 11,
      userId: 6,
      assignedHours: 0,
    });
    expect(auditEventService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 6,
        action: 'capacity-planning.assignment.imported',
        resourceId: '20',
      }),
    );
  });

  it('does not import duplicate GitHub assignments into the active plan', async () => {
    capacityPlanRepository.findOne = vi.fn().mockResolvedValue({
      id: 8,
      workspaceId: 3,
    });
    githubRepositoryRepository.findById.mockResolvedValue({
      id: 4,
      workspaceId: 3,
      fullName: 'team/api',
    });
    githubIssueRepository.findOne.mockResolvedValue({
      id: 11,
      repositoryId: 4,
      githubId: 22,
      githubIssueNumber: 27,
    });
    issueAssignmentRepository.findOne.mockResolvedValue({
      id: 19,
      capacityPlanId: 8,
      issueId: 11,
      userId: 5,
    });

    await service.syncGithubIssueAssigneeChange({
      action: 'assigned',
      repositoryId: 4,
      githubIssueId: 22,
      githubIssueNumber: 27,
      assignee: {id: 111, login: 'octocat'},
    });

    expect(issueAssignmentRepository.create).not.toHaveBeenCalled();
    expect(auditEventService.record).not.toHaveBeenCalled();
  });

  it('removes GitHub unassignments from the current capacity plan', async () => {
    capacityPlanRepository.findOne = vi.fn().mockResolvedValue({
      id: 8,
      workspaceId: 3,
    });
    githubRepositoryRepository.findById.mockResolvedValue({
      id: 4,
      workspaceId: 3,
      fullName: 'team/api',
    });
    githubIssueRepository.findOne = vi.fn().mockResolvedValue({
      id: 11,
      repositoryId: 4,
      githubId: 22,
      githubIssueNumber: 27,
    });
    issueAssignmentRepository.findOne.mockResolvedValue({
      id: 19,
      capacityPlanId: 8,
      issueId: 11,
      userId: 5,
    });

    await service.syncGithubIssueAssigneeChange({
      action: 'unassigned',
      repositoryId: 4,
      githubIssueId: 22,
      githubIssueNumber: 27,
      assignee: {id: 111, login: 'octocat'},
    });

    expect(issueAssignmentRepository.deleteById).toHaveBeenCalledWith(19);
    expect(auditEventService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 5,
        workspaceId: 3,
        action: 'capacity-planning.assignment.removed-from-github',
        resourceType: 'issue-assignment',
        resourceId: '19',
        source: 'github',
      }),
    );
  });

  it('does not audit GitHub unassignments when no local assignment exists', async () => {
    capacityPlanRepository.findOne = vi.fn().mockResolvedValue({
      id: 8,
      workspaceId: 3,
    });
    githubRepositoryRepository.findById.mockResolvedValue({
      id: 4,
      workspaceId: 3,
      fullName: 'team/api',
    });
    githubIssueRepository.findOne.mockResolvedValue({
      id: 11,
      repositoryId: 4,
      githubId: 22,
      githubIssueNumber: 27,
    });
    issueAssignmentRepository.findOne.mockResolvedValue(null);

    await service.syncGithubIssueAssigneeChange({
      action: 'unassigned',
      repositoryId: 4,
      githubIssueId: 22,
      githubIssueNumber: 27,
      assignee: {id: 111, login: 'octocat'},
    });

    expect(issueAssignmentRepository.deleteById).not.toHaveBeenCalled();
    expect(auditEventService.record).not.toHaveBeenCalled();
  });

  it('skips incoming GitHub assignee sync when workspace sync is disabled', async () => {
    githubRepositoryRepository.findById.mockResolvedValue({
      id: 4,
      workspaceId: 3,
      fullName: 'team/api',
    });
    githubIssueRepository.findOne = vi.fn().mockResolvedValue({
      id: 11,
      repositoryId: 4,
      githubId: 22,
      githubIssueNumber: 27,
    });
    workspaceRepository.findById.mockResolvedValue({
      id: 3,
      capacityPlanningSync: false,
    });

    await service.syncGithubIssueAssigneeChange({
      action: 'assigned',
      repositoryId: 4,
      githubIssueId: 22,
      githubIssueNumber: 27,
      assignee: {id: 111, login: 'octocat'},
    });

    expect(issueAssignmentRepository.create).not.toHaveBeenCalled();
    expect(issueAssignmentRepository.deleteById).not.toHaveBeenCalled();
    expect(auditEventService.record).not.toHaveBeenCalled();
  });

  it('skips incoming GitHub assignee sync when the GitHub user is unknown', async () => {
    githubRepositoryRepository.findById.mockResolvedValue({
      id: 4,
      workspaceId: 3,
      fullName: 'team/api',
    });
    githubIssueRepository.findOne.mockResolvedValue({
      id: 11,
      repositoryId: 4,
      githubId: 22,
      githubIssueNumber: 27,
    });
    userRepository.findOne.mockResolvedValue(null);

    await service.syncGithubIssueAssigneeChange({
      action: 'assigned',
      repositoryId: 4,
      githubIssueId: 22,
      githubIssueNumber: 27,
      assignee: {id: 999, login: 'unknown'},
    });

    expect(issueAssignmentRepository.create).not.toHaveBeenCalled();
    expect(issueAssignmentRepository.deleteById).not.toHaveBeenCalled();
    expect(auditEventService.record).not.toHaveBeenCalled();
  });

  it('skips incoming GitHub assignee sync when GitHub id is unmapped and no login is available', async () => {
    githubRepositoryRepository.findById.mockResolvedValue({
      id: 4,
      workspaceId: 3,
      fullName: 'team/api',
    });
    githubIssueRepository.findOne.mockResolvedValue({
      id: 11,
      repositoryId: 4,
      githubId: 22,
      githubIssueNumber: 27,
    });
    userRepository.findOne.mockResolvedValue(null);

    await service.syncGithubIssueAssigneeChange({
      action: 'assigned',
      repositoryId: 4,
      githubIssueId: 22,
      githubIssueNumber: 27,
      assignee: {id: 999},
    });

    expect(userRepository.findOne).toHaveBeenCalledWith({
      where: {githubId: 999},
    });
    expect(issueAssignmentRepository.create).not.toHaveBeenCalled();
    expect(issueAssignmentRepository.deleteById).not.toHaveBeenCalled();
    expect(auditEventService.record).not.toHaveBeenCalled();
  });

  it('skips incoming GitHub assignee sync when the workspace has no capacity plan', async () => {
    githubRepositoryRepository.findById.mockResolvedValue({
      id: 4,
      workspaceId: 3,
      fullName: 'team/api',
    });
    githubIssueRepository.findOne.mockResolvedValue({
      id: 11,
      repositoryId: 4,
      githubId: 22,
      githubIssueNumber: 27,
    });
    capacityPlanRepository.findOne.mockResolvedValue(null);

    await service.syncGithubIssueAssigneeChange({
      action: 'assigned',
      repositoryId: 4,
      githubIssueId: 22,
      githubIssueNumber: 27,
      assignee: {id: 111, login: 'octocat'},
    });

    expect(issueAssignmentRepository.create).not.toHaveBeenCalled();
    expect(issueAssignmentRepository.deleteById).not.toHaveBeenCalled();
    expect(auditEventService.record).not.toHaveBeenCalled();
  });
});
