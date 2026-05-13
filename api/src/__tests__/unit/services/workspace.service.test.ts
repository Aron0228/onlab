import {HttpErrors} from '@loopback/rest';
import {describe, expect, it, vi} from 'vitest';

import {Workspace} from '../../../models';
import {WorkspaceService} from '../../../services/workspace.service';

const createService = (workspace: Workspace) => {
  const workspaceRepository = {
    findById: vi.fn().mockResolvedValue(workspace),
    updateById: vi.fn().mockResolvedValue(undefined),
  };
  const workspaceAuthorizationService = {
    assertWorkspaceOwner: vi.fn().mockResolvedValue('OWNER'),
  };
  const auditEventService = {
    record: vi.fn().mockResolvedValue(undefined),
  };

  return {
    service: new WorkspaceService(
      workspaceRepository as never,
      workspaceAuthorizationService as never,
      auditEventService as never,
    ),
    workspaceRepository,
    workspaceAuthorizationService,
    auditEventService,
  };
};

describe('WorkspaceService (unit)', () => {
  it('soft-deletes a workspace and disconnects sync settings', async () => {
    const workspace = new Workspace({
      id: 11,
      name: 'Demo',
      ownerId: 7,
      githubInstallationId: '123',
      issueSync: true,
      capacityPlanningSync: true,
      prRiskPredictionSync: true,
      reviewerSuggestionSync: true,
      prReviewReminderCron: '*/5 * * * *',
    });
    const {
      service,
      workspaceRepository,
      workspaceAuthorizationService,
      auditEventService,
    } = createService(workspace);

    await service.softDeleteWorkspace({
      workspaceId: 11,
      actorUserId: 7,
      confirmationName: 'Demo',
    });

    expect(
      workspaceAuthorizationService.assertWorkspaceOwner,
    ).toHaveBeenCalledWith(11, 7);
    expect(workspaceRepository.updateById).toHaveBeenCalledWith(
      11,
      expect.objectContaining({
        githubInstallationId: undefined,
        issueSync: false,
        issueSyncDone: false,
        prSyncDone: false,
        capacityPlanningSync: false,
        prRiskPredictionSync: false,
        reviewerSuggestionSync: false,
        prReviewReminderCron: undefined,
      }),
    );
    expect(
      workspaceRepository.updateById.mock.calls[0]?.[1].deletedAt,
    ).toBeInstanceOf(Date);
    expect(auditEventService.record).toHaveBeenCalledWith({
      actorUserId: 7,
      workspaceId: 11,
      action: 'workspace.deleted',
      resourceType: 'workspace',
      resourceId: '11',
      payload: {
        name: 'Demo',
        deletionPolicy: 'soft-delete',
        filesPolicy: 'retained',
      },
    });
  });

  it('rejects mismatched workspace name confirmation', async () => {
    const {service, workspaceRepository} = createService(
      new Workspace({id: 11, name: 'Demo', ownerId: 7}),
    );

    await expect(
      service.softDeleteWorkspace({
        workspaceId: 11,
        actorUserId: 7,
        confirmationName: 'Other',
      }),
    ).rejects.toBeInstanceOf(HttpErrors.UnprocessableEntity);

    expect(workspaceRepository.updateById).not.toHaveBeenCalled();
  });

  it('does not delete an already deleted workspace again', async () => {
    const {service, workspaceRepository, auditEventService} = createService(
      new Workspace({
        id: 11,
        name: 'Demo',
        ownerId: 7,
        deletedAt: new Date(),
      }),
    );

    await service.softDeleteWorkspace({
      workspaceId: 11,
      actorUserId: 7,
    });

    expect(workspaceRepository.updateById).not.toHaveBeenCalled();
    expect(auditEventService.record).not.toHaveBeenCalled();
  });
});
