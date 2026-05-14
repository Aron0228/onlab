import {describe, expect, it} from 'vitest';
import {AuthorizationController} from '../../controllers/system/authorization.controller';
import {WORKSPACE_PERMISSION, WORKSPACE_ROLE} from '../../constants';
import {WorkspacePermission} from '../../constants/system/workspace-permission.const';
import {createAuthorizationMock, securityUsers, workspaceId} from './helpers';

describe('security: protected route permission decisions', () => {
  const permissions = Object.values(WORKSPACE_PERMISSION);
  const memberPermissions: WorkspacePermission[] = [
    WORKSPACE_PERMISSION.WORKSPACE_VIEW,
    WORKSPACE_PERMISSION.COMMUNICATION_VIEW,
    WORKSPACE_PERMISSION.GITHUB_PULL_REQUEST_VIEW,
  ];

  it.each(permissions)(
    'allows workspace owners to pass %s checks',
    async permission => {
      const authorization = createAuthorizationMock();
      const controller = new AuthorizationController(authorization as never);

      await expect(
        controller.check(securityUsers.owner, {workspaceId, permission}),
      ).resolves.toEqual({
        allowed: true,
        permission,
        workspaceId,
        role: WORKSPACE_ROLE.OWNER,
      });
    },
  );

  it.each(permissions.filter(permission => permission !== 'workspace.delete'))(
    'allows workspace admins to pass non-owner %s checks',
    async permission => {
      const authorization = createAuthorizationMock();
      const controller = new AuthorizationController(authorization as never);

      await expect(
        controller.check(securityUsers.admin, {workspaceId, permission}),
      ).resolves.toMatchObject({
        allowed: true,
        permission,
        role: WORKSPACE_ROLE.ADMIN,
      });
    },
  );

  it('denies owner-only delete permission to admins', async () => {
    const authorization = createAuthorizationMock();
    const controller = new AuthorizationController(authorization as never);

    await expect(
      controller.check(securityUsers.admin, {
        workspaceId,
        permission: WORKSPACE_PERMISSION.WORKSPACE_DELETE,
      }),
    ).resolves.toMatchObject({
      allowed: false,
      role: WORKSPACE_ROLE.ADMIN,
    });
  });

  it.each([
    WORKSPACE_PERMISSION.WORKSPACE_VIEW,
    WORKSPACE_PERMISSION.COMMUNICATION_VIEW,
    WORKSPACE_PERMISSION.GITHUB_PULL_REQUEST_VIEW,
  ])('allows regular workspace members to pass %s checks', async permission => {
    const authorization = createAuthorizationMock();
    const controller = new AuthorizationController(authorization as never);

    await expect(
      controller.check(securityUsers.member, {workspaceId, permission}),
    ).resolves.toMatchObject({
      allowed: true,
      role: WORKSPACE_ROLE.MEMBER,
    });
  });

  it.each(
    permissions.filter(permission => !memberPermissions.includes(permission)),
  )('denies privileged %s checks to regular members', async permission => {
    const authorization = createAuthorizationMock();
    const controller = new AuthorizationController(authorization as never);

    await expect(
      controller.check(securityUsers.member, {workspaceId, permission}),
    ).resolves.toMatchObject({
      allowed: false,
      role: WORKSPACE_ROLE.MEMBER,
    });
  });

  it.each(permissions)('denies %s checks to outsiders', async permission => {
    const authorization = createAuthorizationMock();
    const controller = new AuthorizationController(authorization as never);

    await expect(
      controller.check(securityUsers.outsider, {workspaceId, permission}),
    ).resolves.toMatchObject({
      allowed: false,
      role: null,
    });
  });
});
