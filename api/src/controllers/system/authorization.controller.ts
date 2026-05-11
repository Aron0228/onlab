import {authenticate} from '@loopback/authentication';
import {inject, service} from '@loopback/core';
import {post, requestBody} from '@loopback/rest';
import {SecurityBindings, UserProfile} from '@loopback/security';
import {WORKSPACE_PERMISSION, WorkspacePermission} from '../../constants';
import {
  WorkspaceAuthorizationService,
  WorkspacePermissionDecision,
} from '../../services';

const KNOWN_PERMISSIONS = new Set<string>(Object.values(WORKSPACE_PERMISSION));

type PermissionCheckRequest = {
  workspaceId: number;
  permission: WorkspacePermission;
};

@authenticate('jwt-header')
export class AuthorizationController {
  constructor(
    @service(WorkspaceAuthorizationService)
    private workspaceAuthorizationService: WorkspaceAuthorizationService,
  ) {}

  @post('/authorization/check')
  async check(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['workspaceId', 'permission'],
            properties: {
              workspaceId: {type: 'number'},
              permission: {
                type: 'string',
                enum: Object.values(WORKSPACE_PERMISSION),
              },
            },
          },
        },
      },
    })
    body: PermissionCheckRequest,
  ): Promise<WorkspacePermissionDecision> {
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);

    if (!KNOWN_PERMISSIONS.has(body.permission)) {
      return {
        allowed: false,
        permission: body.permission,
        workspaceId: body.workspaceId,
        role: null,
      };
    }

    return this.workspaceAuthorizationService.checkPermission(
      body.workspaceId,
      userId,
      body.permission,
    );
  }
}
