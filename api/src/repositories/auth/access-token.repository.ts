import {
  BelongsToAccessor,
  DefaultCrudRepository,
  repository,
} from '@loopback/repository';
import {AccessToken, AccessTokenRelations, User} from '../../models';
import {Getter, inject} from '@loopback/core';
import {PostgresDbDataSource} from '../../datasources';
import {UserRepository} from './user.repository';
import {registerInclusionResolvers} from '../../utils';

export class AccessTokenRepository extends DefaultCrudRepository<
  AccessToken,
  typeof AccessToken.prototype.id,
  AccessTokenRelations
> {
  private readonly user: BelongsToAccessor<
    User,
    typeof AccessToken.prototype.id
  >;

  constructor(
    @inject('datasources.postgresDB') dataSource: PostgresDbDataSource,
    @repository.getter('UserRepository')
    private userRepositoryGetter: Getter<UserRepository>,
  ) {
    super(AccessToken, dataSource);

    this.user = this.createBelongsToAccessorFor(
      'user',
      this.userRepositoryGetter,
    );

    registerInclusionResolvers(AccessToken, this);
  }
}
