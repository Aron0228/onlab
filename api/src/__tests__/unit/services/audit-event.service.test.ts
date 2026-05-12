import {describe, expect, it, vi} from 'vitest';
import {AuditEventService} from '../../../services/audit-event.service';

describe('AuditEventService (unit)', () => {
  const createSubject = () => {
    const repository = {
      create: vi.fn(),
      find: vi.fn(),
    };

    return {
      repository,
      service: new AuditEventService(repository as never),
    };
  };

  it('records audit events with defaults', async () => {
    const {service, repository} = createSubject();
    repository.create.mockImplementation(async value => value);

    const event = await service.record({
      actorUserId: 7,
      workspaceId: 11,
      action: 'workspace.updated',
      resourceType: 'workspace',
      resourceId: '11',
    });

    expect(event).toEqual(
      expect.objectContaining({
        actorUserId: 7,
        workspaceId: 11,
        action: 'workspace.updated',
        resourceType: 'workspace',
        resourceId: '11',
        source: 'user',
        payload: {},
        createdAt: expect.any(String),
      }),
    );
  });

  it('does not reject the caller when persistence fails', async () => {
    const {service, repository} = createSubject();
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    repository.create.mockRejectedValue(new Error('database down'));

    await expect(
      service.record({
        action: 'workspace.deleted',
        resourceType: 'workspace',
        resourceId: '11',
      }),
    ).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledWith(
      'Failed to record audit event.',
      expect.any(Error),
    );
    consoleError.mockRestore();
  });

  it('scopes audit queries to the workspace', async () => {
    const {service, repository} = createSubject();
    repository.find.mockResolvedValue([{id: 1}]);

    await expect(
      service.findForWorkspace(11, {where: {action: 'workspace.updated'}}),
    ).resolves.toEqual([{id: 1}]);

    expect(repository.find).toHaveBeenCalledWith({
      where: {action: 'workspace.updated', workspaceId: 11},
      order: ['createdAt DESC'],
    });
  });
});
