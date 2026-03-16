import {belongsTo, Entity, model, property} from '@loopback/repository';
import {Workspace} from './workspace.model';

@model({
  settings: {
    forceId: false,
    postgresql: {schema: 'system', table: 'invitation'},
  },
})
export class Invitation extends Entity {
  @property({
    type: 'number',
    id: true,
    generated: true,
  })
  id: number;

  @property({
    type: 'string',
    required: true,
    postgresql: {columnName: 'email'},
  })
  email: string;

  @belongsTo(
    () => Workspace,
    {},
    {
      type: 'number',
      required: true,
      postgresql: {columnName: 'workspace_id'},
    },
  )
  workspaceId: number;

  constructor(data?: Partial<Invitation>) {
    super(data);
  }
}

export type InvitationRelations = {
  workspace?: Workspace;
};

export type InvitationWithRelations = Invitation & InvitationRelations;
