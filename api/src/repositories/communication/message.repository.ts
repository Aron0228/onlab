import {Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  HasManyRepositoryFactory,
  repository,
} from '@loopback/repository';
import {PostgresDbDataSource} from '../../datasources';
import {
  Channel,
  Message,
  MessageAttachment,
  MessageRelations,
  User,
} from '../../models';
import {registerInclusionResolvers} from '../../utils';
import {UserRepository} from '../auth';
import {ChannelRepository} from './channel.repository';
import {MessageAttachmentRepository} from './message-attachment.repository';

export class MessageRepository extends DefaultCrudRepository<
  Message,
  typeof Message.prototype.id,
  MessageRelations
> {
  public readonly channel: BelongsToAccessor<
    Channel,
    typeof Message.prototype.id
  >;

  public readonly sender: BelongsToAccessor<User, typeof Message.prototype.id>;

  public readonly attachments: HasManyRepositoryFactory<
    MessageAttachment,
    typeof Message.prototype.id
  >;

  constructor(
    @inject('datasources.postgresDB') dataSource: PostgresDbDataSource,
    @repository.getter('ChannelRepository')
    channelRepositoryGetter: Getter<ChannelRepository>,
    @repository.getter('UserRepository')
    userRepositoryGetter: Getter<UserRepository>,
    @repository.getter('MessageAttachmentRepository')
    messageAttachmentRepositoryGetter: Getter<MessageAttachmentRepository>,
  ) {
    super(Message, dataSource);

    this.channel = this.createBelongsToAccessorFor(
      'channel',
      channelRepositoryGetter,
    );
    this.sender = this.createBelongsToAccessorFor(
      'sender',
      userRepositoryGetter,
    );
    this.attachments = this.createHasManyRepositoryFactoryFor(
      'attachments',
      messageAttachmentRepositoryGetter,
    );

    registerInclusionResolvers(Message, this);
  }
}
