import {
  belongsTo,
  Entity,
  hasMany,
  model,
  property,
} from '@loopback/repository';
import {Workspace} from './workspace.model';
import {UserExpertiseAssoc} from './user-expertise-assoc.model';

@model({
  settings: {
    forceId: false,
    postgresql: {schema: 'system', table: 'expertise'},
  },
})
export class Expertise extends Entity {
  @property({
    type: 'number',
    id: true,
    generated: true,
  })
  id: number;

  @property({
    type: 'string',
    required: true,
    postgresql: {columnName: 'name'},
  })
  name: string;

  @property({
    type: 'string',
    postgresql: {columnName: 'description'},
  })
  description?: string;

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

  @hasMany(() => UserExpertiseAssoc, {keyTo: 'expertiseId'})
  userExpertiseAssocs?: UserExpertiseAssoc[];

  constructor(data?: Partial<Expertise>) {
    super(data);
  }
}

export type ExpertiseRelations = {
  workspace?: Workspace;
  userExpertiseAssocs?: UserExpertiseAssoc[];
};

export type ExpertiseWithRelations = Expertise & ExpertiseRelations;
