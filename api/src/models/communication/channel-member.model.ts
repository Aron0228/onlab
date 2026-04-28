import {belongsTo, Entity, model, property} from '@loopback/repository';
import {User} from '../auth';
import {Channel} from './channel.model';

@model({
  settings: {
    forceId: false,
    postgresql: {schema: 'communication', table: 'channel_member'},
  },
})
export class ChannelMember extends Entity {
  @property({type: 'number', id: true, generated: true})
  id: number;

  @belongsTo(
    () => Channel,
    {},
    {type: 'number', required: true, postgresql: {columnName: 'channel_id'}},
  )
  channelId: number;

  @belongsTo(
    () => User,
    {},
    {type: 'number', required: true, postgresql: {columnName: 'user_id'}},
  )
  userId: number;

  @property({type: 'date', postgresql: {columnName: 'last_read_at'}})
  lastReadAt?: string;

  @property({type: 'date', postgresql: {columnName: 'muted_at'}})
  mutedAt?: string | null;

  @property({type: 'date', postgresql: {columnName: 'created_at'}})
  createdAt?: string;

  constructor(data?: Partial<ChannelMember>) {
    super(data);
  }
}

export type ChannelMemberRelations = {
  channel?: Channel;
  user?: User;
};

export type ChannelMemberWithRelations = ChannelMember & ChannelMemberRelations;
