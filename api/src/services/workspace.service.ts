import {service} from '@loopback/core';
import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {Workspace} from '../models';
import {WorkspaceRepository} from '../repositories';
import {AuditEventService} from './audit-event.service';
import {WorkspaceAuthorizationService} from './workspace-authorization.service';

export type DeleteWorkspaceInput = {
  workspaceId: number;
  actorUserId: number;
  confirmationName?: string;
};

export class WorkspaceService {
  constructor(
    @repository(WorkspaceRepository)
    private workspaceRepository: WorkspaceRepository,
    @service(WorkspaceAuthorizationService)
    private workspaceAuthorizationService: WorkspaceAuthorizationService,
    @service(AuditEventService)
    private auditEventService: AuditEventService,
  ) {}

  async softDeleteWorkspace(input: DeleteWorkspaceInput): Promise<void> {
    const workspace = await this.workspaceRepository.findById(
      input.workspaceId,
    );

    if (workspace.deletedAt) {
      return;
    }

    await this.workspaceAuthorizationService.assertWorkspaceOwner(
      input.workspaceId,
      input.actorUserId,
    );

    if (
      input.confirmationName !== undefined &&
      input.confirmationName !== workspace.name
    ) {
      throw new HttpErrors.UnprocessableEntity(
        'Workspace name confirmation does not match.',
      );
    }

    await this.disconnectWorkspace(workspace);

    await this.auditEventService.record({
      actorUserId: input.actorUserId,
      workspaceId: workspace.id,
      action: 'workspace.deleted',
      resourceType: 'workspace',
      resourceId: String(workspace.id),
      payload: {
        name: workspace.name,
        deletionPolicy: 'soft-delete',
        filesPolicy: 'retained',
      },
    });
  }

  private async disconnectWorkspace(workspace: Workspace): Promise<void> {
    await this.workspaceRepository.updateById(workspace.id, {
      deletedAt: new Date(),
      githubInstallationId: undefined,
      issueSync: false,
      issueSyncDone: false,
      prSyncDone: false,
      capacityPlanningSync: false,
      prRiskPredictionSync: false,
      reviewerSuggestionSync: false,
      prReviewReminderCron: undefined,
    });
  }
}
