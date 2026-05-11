import {Provider, service} from '@loopback/core';
import {
  AuthorizationContext,
  AuthorizationDecision,
  AuthorizationMetadata,
  Authorizer,
} from '@loopback/authorization';
import {securityId, UserProfile} from '@loopback/security';
import {WORKSPACE_PERMISSION, WorkspacePermission} from '../constants';
import {WorkspaceAuthorizationService} from '../services';

export const WORKSPACE_AUTHORIZER =
  'authorizationProviders.workspace-authorizer';

const KNOWN_PERMISSIONS = new Set<string>(Object.values(WORKSPACE_PERMISSION));

export class WorkspaceAuthorizerProvider implements Provider<Authorizer> {
  constructor(
    @service(WorkspaceAuthorizationService)
    private workspaceAuthorizationService: WorkspaceAuthorizationService,
  ) {}

  value(): Authorizer {
    return this.authorize.bind(this);
  }

  async authorize(
    authorizationContext: AuthorizationContext,
    metadata: AuthorizationMetadata,
  ): Promise<AuthorizationDecision> {
    const permission = metadata.resource;

    if (!permission || !KNOWN_PERMISSIONS.has(permission)) {
      return AuthorizationDecision.ABSTAIN;
    }

    const principal = authorizationContext.principals[0];
    const principalProfile = principal as unknown as UserProfile | undefined;
    const rawUserId = principal?.id ?? principalProfile?.[securityId];
    const userId =
      typeof rawUserId === 'number'
        ? rawUserId
        : Number.parseInt(String(rawUserId), 10);
    const workspaceId = this.getWorkspaceId(authorizationContext);

    if (!Number.isFinite(userId) || !Number.isFinite(workspaceId)) {
      return AuthorizationDecision.DENY;
    }

    const decision = await this.workspaceAuthorizationService.checkPermission(
      workspaceId,
      userId,
      permission as WorkspacePermission,
    );

    return decision.allowed
      ? AuthorizationDecision.ALLOW
      : AuthorizationDecision.DENY;
  }

  private getWorkspaceId(authorizationContext: AuthorizationContext): number {
    for (const arg of authorizationContext.invocationContext.args) {
      if (typeof arg === 'number') {
        return arg;
      }

      if (typeof arg === 'string') {
        const parsed = Number.parseInt(arg, 10);

        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }

      if (arg && typeof arg === 'object' && 'workspaceId' in arg) {
        const parsed = Number.parseInt(
          String((arg as {workspaceId?: unknown}).workspaceId),
          10,
        );

        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }

    return Number.NaN;
  }
}
