import {belongsTo, model, property} from '@loopback/repository';
import {User} from '../auth';
import {Workspace} from './workspace.model';
import {WorkspaceMemberRole} from '../../constants';
import {AIPredictable} from './ai-predictable.model';

@model({
  settings: {
    forceId: false,
    newsFeedPredictable: {
      enabled: true,
      sourceType: 'workspace-member',
    },
    postgresql: {schema: 'system', table: 'workspace_member'},
  },
})
export class WorkspaceMember extends AIPredictable {
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
      postgresql: {columnName: 'user_id'},
    },
  )
  userId?: number;

  @belongsTo(
    () => Workspace,
    {},
    {
      type: 'number',
      postgresql: {columnName: 'workspace_id'},
    },
  )
  workspaceId?: number;

  @property({
    type: 'string',
    jsonSchema: {
      enum: ['ADMIN', 'MEMBER'],
    },
    postgresql: {columnName: 'role'},
  })
  role?: WorkspaceMemberRole;

  constructor(data?: Partial<WorkspaceMember>) {
    super(data);
  }
}

export type WorkspaceMemberRelations = {
  user?: User;
  workspace?: Workspace;
};

export type WorkspaceMemberWithRelations = WorkspaceMember &
  WorkspaceMemberRelations;
