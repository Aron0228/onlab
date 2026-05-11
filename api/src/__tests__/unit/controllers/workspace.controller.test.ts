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
    const authorization = {
      getAuthenticatedUserId: vi.fn().mockReturnValue(7),
      mergeWorkspaceAccessFilter: vi.fn().mockResolvedValue({
        where: {ownerId: 7},
      }),
      assertWorkspaceOwner: vi.fn().mockResolvedValue('OWNER'),
      assertWorkspaceMember: vi.fn().mockResolvedValue('OWNER'),
    };

    return {
      repository,
      authorization,
      controller: new WorkspaceController(
        repository as never,
        authorization as never,
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

  it('creates workspaces owned by the authenticated user', async () => {
    const {controller, repository} = createController();
    const workspace = new Workspace({id: 11, name: 'Demo', ownerId: 7});
    repository.create.mockResolvedValue(workspace);

    await expect(
      controller.create({id: 7} as never, {name: 'Demo', ownerId: 99}),
    ).resolves.toEqual(workspace);

    expect(repository.create).toHaveBeenCalledWith({
      name: 'Demo',
      ownerId: 7,
    });
  });

  it('requires workspace owner for AI and sync settings updates', async () => {
    const {controller, repository, authorization} = createController();
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
  });
});
