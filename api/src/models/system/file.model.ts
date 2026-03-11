import {belongsTo, Entity, model, property} from '@loopback/repository';
import {Workspace} from './workspace.model';

@model({
  settings: {
    forceId: false,
    postgresql: {schema: 'system', table: 'file'},
  },
})
export class File extends Entity {
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
  workspaceId?: number;

  @property({
    type: 'string',
    required: true,
    postgresql: {columnName: 'original_name'},
  })
  originalName: string;

  @property({
    type: 'string',
    required: true,
    postgresql: {columnName: 'mime_type'},
  })
  mimeType: string;

  @property({
    type: 'number',
    required: true,
    postgresql: {columnName: 'size'},
  })
  size: number;

  @property({
    type: 'string',
    required: true,
    postgresql: {columnName: 'path'},
  })
  path: string;

  constructor(data?: Partial<File>) {
    super(data);
  }
}

export type FileRelations = {
  workspace?: Workspace;
};

export type FileWithRelations = File & FileRelations;
