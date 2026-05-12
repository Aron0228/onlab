import {describe, expect, it, vi} from 'vitest';

import {WorkspaceMemberController} from '../../../controllers/system/workspace-member.controller';
import {WorkspaceMember} from '../../../models';

describe('WorkspaceMemberController (unit)', () => {
  const createController = () => {
    const repository = {
      find: vi.fn(),
      count: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      updateById: vi.fn(),
      replaceById: vi.fn(),
      deleteById: vi.fn(),
    };
    const authorization = {
      getAuthenticatedUserId: vi.fn().mockReturnValue(7),
      mergeWorkspaceMemberAccessWhere: vi.fn().mockResolvedValue({
        workspaceId: {inq: [11]},
      }),
      assertWorkspaceMember: vi.fn().mockResolvedValue('MEMBER'),
      assertWorkspaceAdminOrOwner: vi.fn().mockResolvedValue('ADMIN'),
    };
    const auditEventService = {
      record: vi.fn().mockResolvedValue(undefined),
    };

    return {
      repository,
      authorization,
      auditEventService,
      controller: new WorkspaceMemberController(
        repository as never,
        authorization as never,
        auditEventService as never,
      ),
    };
  };

  it('scopes member lists to accessible workspaces', async () => {
    const {controller, repository, authorization} = createController();
    const member = new WorkspaceMember({
      id: 17,
      workspaceId: 11,
      userId: 9,
      role: 'MEMBER',
    });
    repository.find.mockResolvedValue([member]);

    await expect(
      controller.find({id: 7} as never, {where: {workspaceId: 11}}),
    ).resolves.toEqual([member]);

    expect(authorization.mergeWorkspaceMemberAccessWhere).toHaveBeenCalledWith(
      {workspaceId: 11},
      7,
    );
    expect(repository.find).toHaveBeenCalledWith({
      where: {workspaceId: {inq: [11]}},
    });
  });

  it('requires admin or owner permissions before removing members', async () => {
    const {controller, repository, authorization, auditEventService} =
      createController();
    repository.findById.mockResolvedValue(
      new WorkspaceMember({
        id: 17,
        workspaceId: 11,
        userId: 9,
        role: 'MEMBER',
      }),
    );
    repository.deleteById.mockResolvedValue(undefined);

    await expect(
      controller.deleteById({id: 7} as never, 17),
    ).resolves.toBeUndefined();

    expect(authorization.assertWorkspaceAdminOrOwner).toHaveBeenCalledWith(
      11,
      7,
    );
    expect(repository.deleteById).toHaveBeenCalledWith(17);
    expect(auditEventService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 7,
        workspaceId: 11,
        action: 'workspace.member.deleted',
        resourceType: 'workspace-member',
        resourceId: '17',
        payload: {memberUserId: 9, role: 'MEMBER'},
      }),
    );
  });

  it('covers member count, single reads, relations, and updates', async () => {
    const {controller, repository, authorization, auditEventService} =
      createController();
    repository.count.mockResolvedValue({count: 1});
    repository.create.mockResolvedValue(
      new WorkspaceMember({
        id: 18,
        workspaceId: 11,
        userId: 10,
        role: 'MEMBER',
      }),
    );
    repository.findById.mockResolvedValue({
      id: 17,
      workspaceId: 11,
      userId: 9,
      role: 'MEMBER',
      user: {id: 9},
    });
    repository.updateById.mockResolvedValue(undefined);
    repository.replaceById.mockResolvedValue(undefined);

    await expect(
      controller.count({id: 7} as never, {workspaceId: 11}),
    ).resolves.toEqual({count: 1});
    await expect(
      controller.findById({id: 7} as never, 17),
    ).resolves.toMatchObject({id: 17});
    await expect(
      controller.getRelation({id: 7} as never, 17, 'user'),
    ).resolves.toEqual({id: 9});
    await expect(
      controller.create(
        {id: 7} as never,
        new WorkspaceMember({workspaceId: 11, userId: 10, role: 'MEMBER'}),
      ),
    ).resolves.toMatchObject({id: 18});
    await expect(
      controller.updateById({id: 7} as never, 17, {role: 'ADMIN'}),
    ).resolves.toBeUndefined();
    await expect(
      controller.replaceById(
        {id: 7} as never,
        17,
        new WorkspaceMember({workspaceId: 11, userId: 9, role: 'ADMIN'}),
      ),
    ).resolves.toBeUndefined();
    await expect(controller.updateAll()).resolves.toEqual({count: 0});
    await expect(controller.deleteAll()).resolves.toEqual({count: 0});

    expect(authorization.assertWorkspaceMember).toHaveBeenCalledWith(11, 7);
    expect(authorization.assertWorkspaceAdminOrOwner).toHaveBeenCalledWith(
      11,
      7,
    );
    expect(auditEventService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'workspace.member.created',
        resourceId: '18',
      }),
    );
    expect(auditEventService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'workspace.member.updated',
        payload: {memberUserId: 9, changedFields: ['role']},
      }),
    );
    expect(auditEventService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'workspace.member.replaced',
        payload: {memberUserId: 9, role: 'ADMIN'},
      }),
    );
  });
});
