import {Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  repository,
} from '@loopback/repository';
import {PostgresDbDataSource} from '../../datasources';
import {
  Channel,
  ChannelMember,
  ChannelMemberRelations,
  User,
} from '../../models';
import {registerInclusionResolvers} from '../../utils';
import {UserRepository} from '../auth';
import {ChannelRepository} from './channel.repository';

export class ChannelMemberRepository extends DefaultCrudRepository<
  ChannelMember,
  typeof ChannelMember.prototype.id,
  ChannelMemberRelations
> {
  public readonly channel: BelongsToAccessor<
    Channel,
    typeof ChannelMember.prototype.id
  >;

  public readonly user: BelongsToAccessor<
    User,
    typeof ChannelMember.prototype.id
  >;

  constructor(
    @inject('datasources.postgresDB') dataSource: PostgresDbDataSource,
    @repository.getter('ChannelRepository')
    channelRepositoryGetter: Getter<ChannelRepository>,
    @repository.getter('UserRepository')
    userRepositoryGetter: Getter<UserRepository>,
  ) {
    super(ChannelMember, dataSource);

    this.channel = this.createBelongsToAccessorFor(
      'channel',
      channelRepositoryGetter,
    );
    this.user = this.createBelongsToAccessorFor('user', userRepositoryGetter);

    registerInclusionResolvers(ChannelMember, this);
  }
}
