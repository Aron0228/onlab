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
  ChannelMember,
  ChannelRelations,
  Message,
  User,
  Workspace,
} from '../../models';
import {registerInclusionResolvers} from '../../utils';
import {UserRepository} from '../auth';
import {WorkspaceRepository} from '../system';
import {ChannelMemberRepository} from './channel-member.repository';
import {MessageRepository} from './message.repository';

export class ChannelRepository extends DefaultCrudRepository<
  Channel,
  typeof Channel.prototype.id,
  ChannelRelations
> {
  public readonly workspace: BelongsToAccessor<
    Workspace,
    typeof Channel.prototype.id
  >;

  public readonly createdBy: BelongsToAccessor<
    User,
    typeof Channel.prototype.id
  >;

  public readonly members: HasManyRepositoryFactory<
    ChannelMember,
    typeof Channel.prototype.id
  >;

  public readonly messages: HasManyRepositoryFactory<
    Message,
    typeof Channel.prototype.id
  >;

  constructor(
    @inject('datasources.postgresDB') dataSource: PostgresDbDataSource,
    @repository.getter('WorkspaceRepository')
    workspaceRepositoryGetter: Getter<WorkspaceRepository>,
    @repository.getter('UserRepository')
    userRepositoryGetter: Getter<UserRepository>,
    @repository.getter('ChannelMemberRepository')
    channelMemberRepositoryGetter: Getter<ChannelMemberRepository>,
    @repository.getter('MessageRepository')
    messageRepositoryGetter: Getter<MessageRepository>,
  ) {
    super(Channel, dataSource);

    this.workspace = this.createBelongsToAccessorFor(
      'workspace',
      workspaceRepositoryGetter,
    );
    this.createdBy = this.createBelongsToAccessorFor(
      'createdBy',
      userRepositoryGetter,
    );
    this.members = this.createHasManyRepositoryFactoryFor(
      'members',
      channelMemberRepositoryGetter,
    );
    this.messages = this.createHasManyRepositoryFactoryFor(
      'messages',
      messageRepositoryGetter,
    );

    registerInclusionResolvers(Channel, this);
  }
}
