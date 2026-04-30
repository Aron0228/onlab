import {Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  repository,
} from '@loopback/repository';
import {PostgresDbDataSource} from '../../datasources';
import {
  File,
  Message,
  MessageAttachment,
  MessageAttachmentRelations,
} from '../../models';
import {registerInclusionResolvers} from '../../utils';
import {FileRepository} from '../system';
import {MessageRepository} from './message.repository';

export class MessageAttachmentRepository extends DefaultCrudRepository<
  MessageAttachment,
  typeof MessageAttachment.prototype.id,
  MessageAttachmentRelations
> {
  public readonly message: BelongsToAccessor<
    Message,
    typeof MessageAttachment.prototype.id
  >;

  public readonly file: BelongsToAccessor<
    File,
    typeof MessageAttachment.prototype.id
  >;

  constructor(
    @inject('datasources.postgresDB') dataSource: PostgresDbDataSource,
    @repository.getter('MessageRepository')
    messageRepositoryGetter: Getter<MessageRepository>,
    @repository.getter('FileRepository')
    fileRepositoryGetter: Getter<FileRepository>,
  ) {
    super(MessageAttachment, dataSource);

    this.message = this.createBelongsToAccessorFor(
      'message',
      messageRepositoryGetter,
    );
    this.file = this.createBelongsToAccessorFor('file', fileRepositoryGetter);

    registerInclusionResolvers(MessageAttachment, this);
  }
}
