import {
  belongsTo,
  Entity,
  hasMany,
  model,
  property,
} from '@loopback/repository';
import {User} from '../auth';
import {Workspace} from '../system';
import {ChannelMember} from './channel-member.model';
import {Message} from './message.model';

export type ChannelType = 'DIRECT' | 'GROUP';

@model({
  settings: {
    forceId: false,
    postgresql: {schema: 'communication', table: 'channel'},
  },
})
export class Channel extends Entity {
  @property({type: 'number', id: true, generated: true})
  id: number;

  @belongsTo(
    () => Workspace,
    {},
    {type: 'number', required: true, postgresql: {columnName: 'workspace_id'}},
  )
  workspaceId: number;

  @belongsTo(
    () => User,
    {},
    {type: 'number', required: true, postgresql: {columnName: 'created_by_id'}},
  )
  createdById: number;

  @property({
    type: 'string',
    required: true,
    jsonSchema: {enum: ['DIRECT', 'GROUP']},
    postgresql: {columnName: 'type'},
  })
  type: ChannelType;

  @property({type: 'string', postgresql: {columnName: 'name'}})
  name?: string;

  @property({type: 'string', postgresql: {columnName: 'direct_key'}})
  directKey?: string;

  @property({type: 'date', postgresql: {columnName: 'created_at'}})
  createdAt?: string;

  @property({type: 'date', postgresql: {columnName: 'updated_at'}})
  updatedAt?: string;

  @hasMany(() => ChannelMember, {keyTo: 'channelId'})
  members?: ChannelMember[];

  @hasMany(() => Message, {keyTo: 'channelId'})
  messages?: Message[];

  constructor(data?: Partial<Channel>) {
    super(data);
  }
}

export type ChannelRelations = {
  workspace?: Workspace;
  createdBy?: User;
  members?: ChannelMember[];
  messages?: Message[];
};

export type ChannelWithRelations = Channel & ChannelRelations;
