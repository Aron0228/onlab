import {authenticate} from '@loopback/authentication';
import {inject, intercept, service} from '@loopback/core';
import {Filter} from '@loopback/repository';
import {get, param} from '@loopback/rest';
import {SecurityBindings, UserProfile} from '@loopback/security';
import {AuditEvent} from '../../models';
import {AuditEventService} from '../../services/audit-event.service';
import {WorkspaceAuthorizationService} from '../../services/workspace-authorization.service';

@authenticate('jwt-header')
export class AuditEventController {
  constructor(
    @service(AuditEventService)
    private auditEventService: AuditEventService,
    @service(WorkspaceAuthorizationService)
    private workspaceAuthorizationService: WorkspaceAuthorizationService,
  ) {}

  @get('/workspaces/{workspaceId}/auditEvents')
  @intercept('interceptors.json-api-serializer')
  async findForWorkspace(
    @inject(SecurityBindings.USER) userProfile: UserProfile,
    @param.path.number('workspaceId') workspaceId: number,
    @param.query.object('filter') filter?: Filter<AuditEvent>,
  ): Promise<AuditEvent[]> {
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);

    await this.workspaceAuthorizationService.assertWorkspaceAdminOrOwner(
      workspaceId,
      userId,
    );

    return this.auditEventService.findForWorkspace(workspaceId, filter);
  }
}
