import {describe, expect, it, vi, beforeEach} from 'vitest';

import {IssueAssignment} from '../../../models';
import {CapacityPlanningSyncService} from '../../../services/capacity-planning-sync.service';

describe('CapacityPlanningSyncService (unit)', () => {
  let capacityPlanRepository: {findById: ReturnType<typeof vi.fn>};
  let githubIssueRepository: {findById: ReturnType<typeof vi.fn>};
  let githubRepositoryRepository: {findById: ReturnType<typeof vi.fn>};
  let userRepository: {findById: ReturnType<typeof vi.fn>};
  let workspaceRepository: {findById: ReturnType<typeof vi.fn>};
  let githubService: {setIssueAssignees: ReturnType<typeof vi.fn>};
  let service: CapacityPlanningSyncService;

  beforeEach(() => {
    capacityPlanRepository = {
      findById: vi.fn().mockResolvedValue({id: 8, workspaceId: 3}),
    };
    githubIssueRepository = {
      findById: vi
        .fn()
        .mockResolvedValue({id: 11, repositoryId: 4, githubIssueNumber: 27}),
    };
    githubRepositoryRepository = {
      findById: vi.fn().mockResolvedValue({id: 4, fullName: 'team/api'}),
    };
    userRepository = {
      findById: vi.fn().mockResolvedValue({id: 5, username: 'octocat'}),
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

    service = new CapacityPlanningSyncService(
      capacityPlanRepository as never,
      githubIssueRepository as never,
      githubRepositoryRepository as never,
      userRepository as never,
      workspaceRepository as never,
      githubService as never,
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
  });
});
