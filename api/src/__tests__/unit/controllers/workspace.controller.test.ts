import {describe, expect, it, vi} from 'vitest';

import {WorkspaceController} from '../../../controllers/system/workspace.controller';
import {Workspace} from '../../../models';

describe('WorkspaceController (unit)', () => {
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
    const channelRepository = {
      find: vi.fn(),
    };
    const channelMemberRepository = {
      find: vi.fn(),
    };
    const authorization = {
      getAuthenticatedUserId: vi.fn().mockReturnValue(7),
      mergeWorkspaceAccessFilter: vi.fn().mockResolvedValue({
        where: {ownerId: 7},
      }),
      checkPermission: vi.fn().mockResolvedValue({
        allowed: true,
        role: 'OWNER',
      }),
      assertWorkspaceOwner: vi.fn().mockResolvedValue('OWNER'),
      assertWorkspaceMember: vi.fn().mockResolvedValue('OWNER'),
    };
    const auditEventService = {
      record: vi.fn().mockResolvedValue(undefined),
    };
    const workspaceService = {
      softDeleteWorkspace: vi.fn().mockResolvedValue(undefined),
    };

    return {
      repository,
      channelRepository,
      channelMemberRepository,
      authorization,
      auditEventService,
      workspaceService,
      controller: new WorkspaceController(
        repository as never,
        channelRepository as never,
        channelMemberRepository as never,
        authorization as never,
        auditEventService as never,
        workspaceService as never,
      ),
    };
  };

  it('scopes workspace listing to the authenticated user', async () => {
    const {controller, repository, authorization} = createController();
    const workspace = new Workspace({id: 11, name: 'Demo', ownerId: 7});
    repository.find.mockResolvedValue([workspace]);

    await expect(
      controller.find({id: 7} as never, {where: {name: 'Demo'}}),
    ).resolves.toEqual([workspace]);

    expect(authorization.mergeWorkspaceAccessFilter).toHaveBeenCalledWith(
      {where: {name: 'Demo'}},
      7,
    );
    expect(repository.find).toHaveBeenCalledWith({where: {ownerId: 7}});
  });

  it('returns navigation items and only joined group channels', async () => {
    const {
      controller,
      authorization,
      channelMemberRepository,
      channelRepository,
    } = createController();
    authorization.checkPermission.mockImplementation(
      (_workspaceId: number, _userId: number, permission: string) =>
        Promise.resolve({
          allowed: permission !== 'capacity-plan.manage',
          role: 'ADMIN',
        }),
    );
    channelMemberRepository.find.mockResolvedValue([
      {channelId: 20},
      {channelId: 30},
    ]);
    channelRepository.find.mockResolvedValue([
      {id: 20, name: 'general'},
      {id: 30, name: 'dev-frontend'},
    ]);

    await expect(controller.navigation({id: 7} as never, 11)).resolves.toEqual({
      items: [
        expect.objectContaining({id: 'news-feed'}),
        expect.objectContaining({id: 'direct-messages'}),
        expect.objectContaining({id: 'issues'}),
        expect.objectContaining({id: 'pull-requests'}),
        expect.objectContaining({id: 'settings'}),
      ],
      channels: [
        {id: 20, name: 'general'},
        {id: 30, name: 'dev-frontend'},
      ],
      canCreateChannels: true,
    });

    expect(authorization.assertWorkspaceMember).toHaveBeenCalledWith(11, 7);
    expect(channelMemberRepository.find).toHaveBeenCalledWith({
      where: {userId: 7},
    });
    expect(channelRepository.find).toHaveBeenCalledWith({
      where: {
        id: {inq: [20, 30]},
        workspaceId: 11,
        type: 'GROUP',
      },
      order: ['id ASC'],
    });
  });

  it('creates workspaces owned by the authenticated user', async () => {
    const {controller, repository, auditEventService} = createController();
    const workspace = new Workspace({id: 11, name: 'Demo', ownerId: 7});
    repository.create.mockResolvedValue(workspace);

    await expect(
      controller.create({id: 7} as never, {name: 'Demo', ownerId: 99}),
    ).resolves.toEqual(workspace);

    expect(repository.create).toHaveBeenCalledWith({
      name: 'Demo',
      ownerId: 7,
    });
    expect(auditEventService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 7,
        workspaceId: 11,
        action: 'workspace.created',
        resourceType: 'workspace',
        resourceId: '11',
      }),
    );
  });

  it('requires workspace owner for AI and sync settings updates', async () => {
    const {controller, repository, authorization, auditEventService} =
      createController();
    repository.updateById.mockResolvedValue(undefined);

    await expect(
      controller.updateById({id: 7} as never, 11, {
        capacityPlanningSync: false,
      }),
    ).resolves.toBeUndefined();

    expect(authorization.assertWorkspaceOwner).toHaveBeenCalledWith(11, 7);
    expect(repository.updateById).toHaveBeenCalledWith(11, {
      capacityPlanningSync: false,
    });
    expect(auditEventService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'workspace.updated',
        payload: {changedFields: ['capacityPlanningSync']},
      }),
    );
  });

  it('audits workspace replacement and soft deletion', async () => {
    const {controller, repository, auditEventService, workspaceService} =
      createController();
    repository.replaceById.mockResolvedValue(undefined);

    await expect(
      controller.replaceById({id: 7} as never, 11, {
        name: 'Renamed',
      }),
    ).resolves.toBeUndefined();
    await expect(
      controller.deleteById({id: 7} as never, 11, 'Demo'),
    ).resolves.toBeUndefined();

    expect(auditEventService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'workspace.replaced',
        resourceId: '11',
      }),
    );
    expect(workspaceService.softDeleteWorkspace).toHaveBeenCalledWith({
      workspaceId: 11,
      actorUserId: 7,
      confirmationName: 'Demo',
    });
  });
});
