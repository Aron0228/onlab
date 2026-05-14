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
      find: vi.fn().mockResolvedValue([]),
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

  it('covers capacity plan count, single reads, relations, and mutations', async () => {
    const plan = new CapacityPlan({
      id: 8,
      workspaceId: 3,
      start: '2026-04-13T08:00:00.000Z',
      end: '2026-04-17T17:00:00.000Z',
    });
    const repository = {
      count: vi.fn().mockResolvedValue({count: 1}),
      find: vi.fn().mockResolvedValue([]),
      findById: vi.fn().mockResolvedValue({...plan, entries: [{id: 4}]}),
      updateById: vi.fn().mockResolvedValue(undefined),
      replaceById: vi.fn().mockResolvedValue(undefined),
      deleteById: vi.fn().mockResolvedValue(undefined),
    };
    const authorization = createAuthorization();
    const controller = new CapacityPlanController(
      repository as never,
      authorization as never,
    );

    await expect(
      controller.count({id: 7} as never, {workspaceId: 3}),
    ).resolves.toEqual({
      count: 1,
    });
    await expect(
      controller.findById({id: 7} as never, 8),
    ).resolves.toMatchObject({
      id: 8,
    });
    await expect(
      controller.getRelation({id: 7} as never, 8, 'entries'),
    ).resolves.toEqual([{id: 4}]);
    await expect(
      controller.updateById({id: 7} as never, 8, {
        end: '2026-04-18T17:00:00.000Z',
      }),
    ).resolves.toBeUndefined();
    await expect(
      controller.replaceById({id: 7} as never, 8, plan),
    ).resolves.toBeUndefined();
    await expect(
      controller.deleteById({id: 7} as never, 8),
    ).resolves.toBeUndefined();

    expect(repository.count).toHaveBeenCalledWith({
      and: [{workspaceId: 3}, {workspaceId: {inq: [3]}}],
    });
    expect(authorization.assertWorkspaceMember).toHaveBeenCalledWith(3, 7);
    expect(authorization.assertWorkspaceAdminOrOwner).toHaveBeenCalledWith(
      3,
      7,
    );
  });

  it('rejects overlapping capacity plan windows', async () => {
    const repository = {
      create: vi.fn(),
      find: vi.fn().mockResolvedValue([
        new CapacityPlan({
          id: 9,
          workspaceId: 3,
          start: '2026-04-14T12:00:00.000Z',
          end: '2026-04-18T12:00:00.000Z',
        }),
      ]),
    };
    const controller = new CapacityPlanController(
      repository as never,
      createAuthorization() as never,
    );

    await expect(
      controller.create({id: 7} as never, {
        workspaceId: 3,
        start: '2026-04-13T12:00:00.000Z',
        end: '2026-04-17T12:00:00.000Z',
      }),
    ).rejects.toThrow(
      'Capacity plans cannot overlap with another plan in this workspace.',
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects capacity plan windows with an end before the start', async () => {
    const repository = {
      create: vi.fn(),
      find: vi.fn(),
    };
    const controller = new CapacityPlanController(
      repository as never,
      createAuthorization() as never,
    );

    await expect(
      controller.create({id: 7} as never, {
        workspaceId: 3,
        start: '2026-04-17T12:00:00.000Z',
        end: '2026-04-13T12:00:00.000Z',
      }),
    ).rejects.toThrow('Capacity plan start date must be before the end date.');
    expect(repository.find).not.toHaveBeenCalled();
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

  it('covers capacity plan entry count, single reads, relations, and mutations', async () => {
    const entry = new CapacityPlanEntry({
      id: 4,
      capacityPlanId: 8,
      userId: 5,
      capacityHours: 24,
    });
    const entryRepository = {
      count: vi.fn().mockResolvedValue({count: 1}),
      findById: vi.fn().mockResolvedValue({...entry, user: {id: 5}}),
      updateById: vi.fn().mockResolvedValue(undefined),
      replaceById: vi.fn().mockResolvedValue(undefined),
      deleteById: vi.fn().mockResolvedValue(undefined),
    };
    const capacityPlanRepository = {
      find: vi
        .fn()
        .mockResolvedValue([new CapacityPlan({id: 8, workspaceId: 3})]),
      findById: vi
        .fn()
        .mockResolvedValue(new CapacityPlan({id: 8, workspaceId: 3})),
    };
    const authorization = createAuthorization();
    const controller = new CapacityPlanEntryController(
      entryRepository as never,
      capacityPlanRepository as never,
      authorization as never,
    );

    await expect(
      controller.count({id: 7} as never, {userId: 5}),
    ).resolves.toEqual({
      count: 1,
    });
    await expect(
      controller.findById({id: 7} as never, 4),
    ).resolves.toMatchObject({
      id: 4,
    });
    await expect(
      controller.getRelation({id: 7} as never, 4, 'user'),
    ).resolves.toEqual({id: 5});
    await expect(
      controller.updateById({id: 7} as never, 4, {capacityHours: 28}),
    ).resolves.toBeUndefined();
    await expect(
      controller.replaceById({id: 7} as never, 4, entry),
    ).resolves.toBeUndefined();
    await expect(
      controller.deleteById({id: 7} as never, 4),
    ).resolves.toBeUndefined();

    expect(entryRepository.count).toHaveBeenCalledWith({
      and: [{userId: 5}, {capacityPlanId: {inq: [8]}}],
    });
    expect(authorization.assertWorkspaceMember).toHaveBeenCalledWith(3, 7);
    expect(authorization.assertWorkspaceAdminOrOwner).toHaveBeenCalledWith(
      3,
      7,
    );
  });

  it('covers issue assignment count, single reads, relations, and mutations', async () => {
    const assignment = new IssueAssignment({
      id: 9,
      issueId: 11,
      userId: 5,
      capacityPlanId: 8,
      assignedHours: 6,
    });
    const assignmentRepository = {
      count: vi.fn().mockResolvedValue({count: 1}),
      findById: vi.fn().mockResolvedValue({...assignment, user: {id: 5}}),
      updateById: vi.fn().mockResolvedValue(undefined),
      replaceById: vi.fn().mockResolvedValue(undefined),
      deleteById: vi.fn().mockResolvedValue(undefined),
    };
    const capacityPlanRepository = {
      find: vi
        .fn()
        .mockResolvedValue([new CapacityPlan({id: 8, workspaceId: 3})]),
      findById: vi
        .fn()
        .mockResolvedValue(new CapacityPlan({id: 8, workspaceId: 3})),
    };
    const authorization = createAuthorization();
    const controller = new IssueAssignmentController(
      assignmentRepository as never,
      capacityPlanRepository as never,
      {syncIssueAssignment: vi.fn()} as never,
      authorization as never,
    );

    await expect(
      controller.count({id: 7} as never, {userId: 5}),
    ).resolves.toEqual({
      count: 1,
    });
    await expect(
      controller.findById({id: 7} as never, 9),
    ).resolves.toMatchObject({
      id: 9,
    });
    await expect(
      controller.getRelation({id: 7} as never, 9, 'user'),
    ).resolves.toEqual({id: 5});
    await expect(
      controller.updateById({id: 7} as never, 9, {assignedHours: 8}),
    ).resolves.toBeUndefined();
    await expect(
      controller.replaceById({id: 7} as never, 9, assignment),
    ).resolves.toBeUndefined();
    await expect(
      controller.deleteById({id: 7} as never, 9),
    ).resolves.toBeUndefined();

    expect(assignmentRepository.count).toHaveBeenCalledWith({
      and: [{userId: 5}, {capacityPlanId: {inq: [8]}}],
    });
    expect(authorization.assertWorkspaceMember).toHaveBeenCalledWith(3, 7);
    expect(authorization.assertWorkspaceAdminOrOwner).toHaveBeenCalledWith(
      3,
      7,
    );
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
