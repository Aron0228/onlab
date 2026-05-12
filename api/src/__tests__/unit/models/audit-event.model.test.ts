import {describe, expect, it} from 'vitest';
import {
  AuditEvent,
  AuditEventWithRelations,
  User,
  Workspace,
} from '../../../models';

describe('AuditEvent model (unit)', () => {
  it('constructs audit events with payload and relations', () => {
    const event: AuditEventWithRelations = new AuditEvent({
      id: 4,
      actorUserId: 7,
      workspaceId: 11,
      action: 'workspace.updated',
      resourceType: 'workspace',
      resourceId: '11',
      source: 'user',
      payload: {changedFields: ['name']},
      createdAt: '2026-05-12T08:00:00.000Z',
    });

    event.actor = new User({id: 7, username: 'ada'});
    event.workspace = new Workspace({id: 11, name: 'DevTeams'});

    expect(event.toJSON()).toMatchObject({
      id: 4,
      actorUserId: 7,
      workspaceId: 11,
      action: 'workspace.updated',
      resourceType: 'workspace',
      resourceId: '11',
      source: 'user',
      payload: {changedFields: ['name']},
      createdAt: '2026-05-12T08:00:00.000Z',
    });
    expect(event.actor?.username).toBe('ada');
    expect(event.workspace?.name).toBe('DevTeams');
  });

  it('constructs an empty audit event entity', () => {
    expect(new AuditEvent().toJSON()).toEqual({});
  });
});
