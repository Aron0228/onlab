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

    return {
      repository,
      authorization,
      controller: new WorkspaceMemberController(
        repository as never,
        authorization as never,
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
    const {controller, repository, authorization} = createController();
    repository.findById.mockResolvedValue(
      new WorkspaceMember({id: 17, workspaceId: 11, userId: 9}),
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
  });
});
