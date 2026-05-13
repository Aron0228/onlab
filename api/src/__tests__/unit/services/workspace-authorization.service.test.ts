import {HttpErrors} from '@loopback/rest';
import {describe, expect, it, vi} from 'vitest';

import {WORKSPACE_PERMISSION, WORKSPACE_ROLE} from '../../../constants';
import {WorkspaceAuthorizationService} from '../../../services';

describe('WorkspaceAuthorizationService (unit)', () => {
  const createService = () => {
    const workspaceRepository = {
      findById: vi.fn(),
      find: vi.fn(),
    };
    const workspaceMemberRepository = {
      findOne: vi.fn(),
      find: vi.fn(),
    };

    return {
      workspaceRepository,
      workspaceMemberRepository,
      service: new WorkspaceAuthorizationService(
        workspaceRepository as never,
        workspaceMemberRepository as never,
      ),
    };
  };

  it('allows workspace owners to perform privileged actions', async () => {
    const {service, workspaceRepository, workspaceMemberRepository} =
      createService();
    workspaceRepository.findById.mockResolvedValue({id: 3, ownerId: 7});

    await expect(
      service.checkPermission(3, 7, WORKSPACE_PERMISSION.GITHUB_INSTALL_MANAGE),
    ).resolves.toEqual({
      allowed: true,
      permission: WORKSPACE_PERMISSION.GITHUB_INSTALL_MANAGE,
      workspaceId: 3,
      role: WORKSPACE_ROLE.OWNER,
    });

    expect(workspaceMemberRepository.findOne).not.toHaveBeenCalled();
  });

  it('allows admins to manage members but denies owner-only settings', async () => {
    const {service, workspaceRepository, workspaceMemberRepository} =
      createService();
    workspaceRepository.findById.mockResolvedValue({id: 3, ownerId: 1});
    workspaceMemberRepository.findOne.mockResolvedValue({
      workspaceId: 3,
      userId: 7,
      role: 'ADMIN',
    });

    await expect(
      service.checkPermission(
        3,
        7,
        WORKSPACE_PERMISSION.WORKSPACE_MEMBERS_MANAGE,
      ),
    ).resolves.toMatchObject({allowed: true, role: WORKSPACE_ROLE.ADMIN});
    await expect(
      service.checkPermission(3, 7, WORKSPACE_PERMISSION.GITHUB_INSTALL_MANAGE),
    ).resolves.toMatchObject({allowed: true, role: WORKSPACE_ROLE.ADMIN});
    await expect(
      service.checkPermission(3, 7, WORKSPACE_PERMISSION.AI_SETTINGS_MANAGE),
    ).resolves.toMatchObject({allowed: false, role: WORKSPACE_ROLE.ADMIN});
  });

  it('denies non-members and throws when asserted', async () => {
    const {service, workspaceRepository, workspaceMemberRepository} =
      createService();
    workspaceRepository.findById.mockResolvedValue({id: 3, ownerId: 1});
    workspaceMemberRepository.findOne.mockResolvedValue(null);

    await expect(
      service.checkPermission(3, 7, WORKSPACE_PERMISSION.WORKSPACE_VIEW),
    ).resolves.toMatchObject({allowed: false, role: null});
    await expect(service.assertWorkspaceMember(3, 7)).rejects.toBeInstanceOf(
      HttpErrors.Forbidden,
    );
  });

  it('denies access to soft-deleted workspaces', async () => {
    const {service, workspaceRepository, workspaceMemberRepository} =
      createService();
    workspaceRepository.findById.mockResolvedValue({
      id: 3,
      ownerId: 7,
      deletedAt: new Date(),
    });

    await expect(
      service.checkPermission(3, 7, WORKSPACE_PERMISSION.WORKSPACE_VIEW),
    ).resolves.toMatchObject({allowed: false, role: null});
    expect(workspaceMemberRepository.findOne).not.toHaveBeenCalled();
  });

  it('merges workspace access into filters', async () => {
    const {service, workspaceMemberRepository} = createService();
    workspaceMemberRepository.find.mockResolvedValue([
      {workspaceId: 3},
      {workspaceId: 4},
    ]);

    await expect(
      service.mergeWorkspaceAccessFilter({where: {name: 'API'}}, 7),
    ).resolves.toEqual({
      where: {
        and: [
          {name: 'API'},
          {
            and: [{deletedAt: null}, {or: [{ownerId: 7}, {id: {inq: [3, 4]}}]}],
          },
        ],
      },
    });
  });
});
