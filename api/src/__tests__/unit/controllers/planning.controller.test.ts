import {describe, expect, it, vi} from 'vitest';

import {
  CapacityPlanController,
  CapacityPlanEntryController,
  IssueAssignmentController,
} from '../../../controllers';
import {
  CapacityPlan,
  CapacityPlanEntry,
  IssueAssignment,
} from '../../../models';

const createAuthorization = () => ({
  getAuthenticatedUserId: vi.fn().mockReturnValue(7),
  accessibleWorkspaceIds: vi.fn().mockResolvedValue([3]),
  assertWorkspaceMember: vi.fn().mockResolvedValue('MEMBER'),
  assertWorkspaceAdminOrOwner: vi.fn().mockResolvedValue('ADMIN'),
});

describe('Planning controllers (unit)', () => {
  it('scopes capacity plan lists to accessible workspaces', async () => {
    const repository = {
      find: vi.fn().mockResolvedValue([
        new CapacityPlan({
          id: 8,
          workspaceId: 3,
          start: '2026-04-13T08:00:00.000Z',
          end: '2026-04-17T17:00:00.000Z',
        }),
      ]),
    };
    const controller = new CapacityPlanController(
      repository as never,
      createAuthorization() as never,
    );

    await controller.find({id: 7} as never, {where: {workspaceId: 3}});

    expect(repository.find).toHaveBeenCalledWith({
      where: {
        and: [{workspaceId: 3}, {workspaceId: {inq: [3]}}],
      },
    });
  });

  it('requires admin or owner permission when creating capacity plans', async () => {
    const repository = {
      create: vi.fn().mockResolvedValue(new CapacityPlan({id: 8})),
    };
    const authorization = createAuthorization();
    const controller = new CapacityPlanController(
      repository as never,
      authorization as never,
    );

    await controller.create({id: 7} as never, {
      workspaceId: 3,
      start: '2026-04-13T08:00:00.000Z',
      end: '2026-04-17T17:00:00.000Z',
    });

    expect(authorization.assertWorkspaceAdminOrOwner).toHaveBeenCalledWith(
      3,
      7,
    );
  });

  it('scopes capacity plan entries through accessible capacity plans', async () => {
    const entryRepository = {
      find: vi.fn().mockResolvedValue([
        new CapacityPlanEntry({
          id: 4,
          capacityPlanId: 8,
          userId: 5,
          capacityHours: 24,
        }),
      ]),
    };
    const capacityPlanRepository = {
      find: vi.fn().mockResolvedValue([new CapacityPlan({id: 8})]),
    };
    const controller = new CapacityPlanEntryController(
      entryRepository as never,
      capacityPlanRepository as never,
      createAuthorization() as never,
    );

    await controller.find({id: 7} as never, {where: {userId: 5}});

    expect(entryRepository.find).toHaveBeenCalledWith({
      where: {
        and: [{userId: 5}, {capacityPlanId: {inq: [8]}}],
      },
    });
  });

  it('syncs issue assignments after authorized creation', async () => {
    const assignment = new IssueAssignment({
      id: 9,
      issueId: 11,
      userId: 5,
      capacityPlanId: 8,
      assignedHours: 6,
    });
    const repository = {
      create: vi.fn().mockResolvedValue(assignment),
    };
    const capacityPlanRepository = {
      findById: vi.fn().mockResolvedValue(new CapacityPlan({workspaceId: 3})),
    };
    const syncService = {
      syncIssueAssignment: vi.fn().mockResolvedValue(undefined),
    };
    const authorization = createAuthorization();
    const controller = new IssueAssignmentController(
      repository as never,
      capacityPlanRepository as never,
      syncService as never,
      authorization as never,
    );

    await expect(
      controller.create({id: 7} as never, {
        issueId: 11,
        userId: 5,
        capacityPlanId: 8,
        assignedHours: 6,
      }),
    ).resolves.toBe(assignment);
    expect(authorization.assertWorkspaceAdminOrOwner).toHaveBeenCalledWith(
      3,
      7,
    );
    expect(syncService.syncIssueAssignment).toHaveBeenCalledWith(assignment);
  });

  it('keeps issue assignment creation successful if GitHub sync fails', async () => {
    const assignment = new IssueAssignment({
      id: 10,
      issueId: 12,
      userId: 6,
      capacityPlanId: 8,
      assignedHours: 4,
    });
    const repository = {
      create: vi.fn().mockResolvedValue(assignment),
    };
    const capacityPlanRepository = {
      findById: vi.fn().mockResolvedValue(new CapacityPlan({workspaceId: 3})),
    };
    const syncService = {
      syncIssueAssignment: vi.fn().mockRejectedValue(new Error('GitHub')),
    };
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const controller = new IssueAssignmentController(
      repository as never,
      capacityPlanRepository as never,
      syncService as never,
      createAuthorization() as never,
    );

    await expect(
      controller.create({id: 7} as never, {
        issueId: 12,
        userId: 6,
        capacityPlanId: 8,
        assignedHours: 4,
      }),
    ).resolves.toBe(assignment);
    expect(consoleError).toHaveBeenCalledWith(
      'Capacity planning GitHub sync failed',
      expect.objectContaining({
        issueAssignmentId: 10,
        error: expect.any(Error),
      }),
    );
    consoleError.mockRestore();
  });
});
