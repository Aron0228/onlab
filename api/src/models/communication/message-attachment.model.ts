import {belongsTo, Entity, model, property} from '@loopback/repository';
import {File} from '../system';
import {Message} from './message.model';

@model({
  settings: {
    forceId: false,
    postgresql: {schema: 'communication', table: 'message_attachment'},
  },
})
export class MessageAttachment extends Entity {
  @property({type: 'number', id: true, generated: true})
  id: number;

  @belongsTo(
    () => Message,
    {},
    {type: 'number', required: true, postgresql: {columnName: 'message_id'}},
  )
  messageId: number;

  @belongsTo(
    () => File,
    {},
    {type: 'number', required: true, postgresql: {columnName: 'file_id'}},
  )
  fileId: number;

  constructor(data?: Partial<MessageAttachment>) {
    super(data);
  }
}

export type MessageAttachmentRelations = {
  message?: Message;
  file?: File;
};

export type MessageAttachmentWithRelations = MessageAttachment &
  MessageAttachmentRelations;
