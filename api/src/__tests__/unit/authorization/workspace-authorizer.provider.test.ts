import {
  AuthorizationDecision,
  type AuthorizationContext,
  type AuthorizationMetadata,
} from '@loopback/authorization';
import {describe, expect, it, vi} from 'vitest';

import {WorkspaceAuthorizerProvider} from '../../../authorization/workspace-authorizer.provider';
import {WORKSPACE_PERMISSION} from '../../../constants';

describe('WorkspaceAuthorizerProvider (unit)', () => {
  const createProvider = () => {
    const service = {
      checkPermission: vi.fn().mockResolvedValue({allowed: true}),
    };
    const provider = new WorkspaceAuthorizerProvider(service as never);

    return {
      service,
      provider,
    };
  };

  const createContext = (
    args: unknown[],
    principal: {id?: unknown; [key: string]: unknown} = {id: 7},
  ): AuthorizationContext =>
    ({
      principals: [principal],
      invocationContext: {args},
    }) as AuthorizationContext;

  it('abstains for metadata without a known workspace permission', async () => {
    const {provider, service} = createProvider();

    await expect(
      provider.authorize(createContext([3]), {
        resource: 'unknown.permission',
      } as AuthorizationMetadata),
    ).resolves.toBe(AuthorizationDecision.ABSTAIN);
    expect(service.checkPermission).not.toHaveBeenCalled();
  });

  it('denies when user id or workspace id cannot be resolved', async () => {
    const {provider, service} = createProvider();

    await expect(
      provider.authorize(createContext([{other: 3}], {id: 'not-a-number'}), {
        resource: WORKSPACE_PERMISSION.WORKSPACE_VIEW,
      } as AuthorizationMetadata),
    ).resolves.toBe(AuthorizationDecision.DENY);
    expect(service.checkPermission).not.toHaveBeenCalled();
  });

  it('allows when the authorization service allows the permission', async () => {
    const {provider, service} = createProvider();

    await expect(
      provider.authorize(createContext([{workspaceId: '3'}]), {
        resource: WORKSPACE_PERMISSION.WORKSPACE_VIEW,
      } as AuthorizationMetadata),
    ).resolves.toBe(AuthorizationDecision.ALLOW);
    expect(service.checkPermission).toHaveBeenCalledWith(
      3,
      7,
      WORKSPACE_PERMISSION.WORKSPACE_VIEW,
    );
  });

  it('denies when the authorization service denies the permission', async () => {
    const {provider, service} = createProvider();
    service.checkPermission.mockResolvedValue({allowed: false});

    await expect(
      provider.authorize(createContext(['3']), {
        resource: WORKSPACE_PERMISSION.WORKSPACE_SETTINGS_MANAGE,
      } as AuthorizationMetadata),
    ).resolves.toBe(AuthorizationDecision.DENY);
  });
});
