import {describe, expect, it, vi} from 'vitest';

import {AuthorizationController} from '../../../controllers/system/authorization.controller';
import {WORKSPACE_PERMISSION} from '../../../constants';

describe('AuthorizationController (unit)', () => {
  it('returns backend permission decisions for route guards', async () => {
    const service = {
      getAuthenticatedUserId: vi.fn().mockReturnValue(7),
      checkPermission: vi.fn().mockResolvedValue({
        allowed: true,
        permission: WORKSPACE_PERMISSION.WORKSPACE_VIEW,
        workspaceId: 3,
        role: 'MEMBER',
      }),
    };
    const controller = new AuthorizationController(service as never);

    await expect(
      controller.check({id: 7} as never, {
        workspaceId: 3,
        permission: WORKSPACE_PERMISSION.WORKSPACE_VIEW,
      }),
    ).resolves.toEqual({
      allowed: true,
      permission: WORKSPACE_PERMISSION.WORKSPACE_VIEW,
      workspaceId: 3,
      role: 'MEMBER',
    });

    expect(service.checkPermission).toHaveBeenCalledWith(
      3,
      7,
      WORKSPACE_PERMISSION.WORKSPACE_VIEW,
    );
  });

  it('denies unknown permissions without delegating', async () => {
    const service = {
      getAuthenticatedUserId: vi.fn().mockReturnValue(7),
      checkPermission: vi.fn(),
    };
    const controller = new AuthorizationController(service as never);

    await expect(
      controller.check({id: 7} as never, {
        workspaceId: 3,
        permission: 'workspace.unknown' as never,
      }),
    ).resolves.toEqual({
      allowed: false,
      permission: 'workspace.unknown',
      workspaceId: 3,
      role: null,
    });

    expect(service.checkPermission).not.toHaveBeenCalled();
  });
});
