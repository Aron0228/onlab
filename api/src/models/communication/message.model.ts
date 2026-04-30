import {
  belongsTo,
  Entity,
  hasMany,
  model,
  property,
} from '@loopback/repository';
import {User} from '../auth';
import {Channel} from './channel.model';
import {MessageAttachment} from './message-attachment.model';

@model({
  settings: {
    forceId: false,
    postgresql: {schema: 'communication', table: 'message'},
  },
})
export class Message extends Entity {
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
    {type: 'number', required: true, postgresql: {columnName: 'sender_id'}},
  )
  senderId: number;

  @property({type: 'string', postgresql: {columnName: 'content'}})
  content?: string;

  @property({type: 'date', postgresql: {columnName: 'created_at'}})
  createdAt?: string;

  @property({type: 'date', postgresql: {columnName: 'updated_at'}})
  updatedAt?: string;

  @hasMany(() => MessageAttachment, {keyTo: 'messageId'})
  attachments?: MessageAttachment[];

  constructor(data?: Partial<Message>) {
    super(data);
  }
}

export type MessageRelations = {
  channel?: Channel;
  sender?: User;
  attachments?: MessageAttachment[];
};

export type MessageWithRelations = Message & MessageRelations;
