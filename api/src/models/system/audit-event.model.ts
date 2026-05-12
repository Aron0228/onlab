import {Entity, belongsTo, model, property} from '@loopback/repository';
import {User} from '../auth';
import {Workspace} from './workspace.model';

@model({
  settings: {
    forceId: false,
    postgresql: {schema: 'system', table: 'audit_event'},
  },
})
export class AuditEvent extends Entity {
  @property({
    type: 'number',
    id: true,
    generated: true,
  })
  id: number;

  @belongsTo(
    () => Workspace,
    {},
    {
      type: 'number',
      postgresql: {columnName: 'workspace_id'},
    },
  )
  workspaceId?: number | null;

  @belongsTo(
    () => User,
    {name: 'actor'},
    {
      type: 'number',
      postgresql: {columnName: 'actor_user_id'},
    },
  )
  actorUserId?: number | null;

  @property({
    type: 'string',
    required: true,
    postgresql: {columnName: 'action'},
  })
  action: string;

  @property({
    type: 'string',
    required: true,
    postgresql: {columnName: 'resource_type'},
  })
  resourceType: string;

  @property({
    type: 'string',
    postgresql: {columnName: 'resource_id'},
  })
  resourceId?: string | null;

  @property({
    type: 'string',
    required: true,
    postgresql: {columnName: 'source'},
  })
  source: string;

  @property({
    type: 'object',
    postgresql: {columnName: 'payload', dataType: 'jsonb'},
  })
  payload?: Record<string, unknown>;

  @property({
    type: 'date',
    postgresql: {columnName: 'created_at'},
  })
  createdAt?: string;

  constructor(data?: Partial<AuditEvent>) {
    super(data);
  }
}

export type AuditEventRelations = {
  actor?: User;
  workspace?: Workspace;
};

export type AuditEventWithRelations = AuditEvent & AuditEventRelations;
