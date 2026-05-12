import {Entity, belongsTo, model, property} from '@loopback/repository';
import {User} from '../auth';
import {Workspace} from './workspace.model';

@model({
  settings: {
    forceId: false,
    postgresql: {schema: 'system', table: 'notification'},
  },
})
export class Notification extends Entity {
  @property({
    type: 'number',
    id: true,
    generated: true,
  })
  id: number;

  @belongsTo(
    () => User,
    {},
    {
      type: 'number',
      required: true,
      postgresql: {columnName: 'user_id'},
    },
  )
  userId: number;

  @belongsTo(
    () => Workspace,
    {},
    {
      type: 'number',
      postgresql: {columnName: 'workspace_id'},
    },
  )
  workspaceId?: number | null;

  @property({
    type: 'string',
    required: true,
    postgresql: {columnName: 'type'},
  })
  type: string;

  @property({
    type: 'string',
    required: true,
    postgresql: {columnName: 'title'},
  })
  title: string;

  @property({
    type: 'string',
    required: true,
    postgresql: {columnName: 'message'},
  })
  message: string;

  @property({
    type: 'string',
    postgresql: {columnName: 'target_route'},
  })
  targetRoute?: string | null;

  @property({
    type: 'string',
    postgresql: {columnName: 'target_url'},
  })
  targetUrl?: string | null;

  @property({
    type: 'object',
    postgresql: {columnName: 'payload', dataType: 'jsonb'},
  })
  payload?: Record<string, unknown>;

  @property({
    type: 'date',
    postgresql: {columnName: 'read_at'},
  })
  readAt?: string | null;

  @property({
    type: 'date',
    postgresql: {columnName: 'created_at'},
  })
  createdAt?: string;

  constructor(data?: Partial<Notification>) {
    super(data);
  }
}

export type NotificationRelations = {
  user?: User;
  workspace?: Workspace;
};

export type NotificationWithRelations = Notification & NotificationRelations;
