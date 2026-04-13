import {Getter, inject} from '@loopback/core';
import {
  DefaultCrudRepository,
  HasManyRepositoryFactory,
  repository,
} from '@loopback/repository';
import {User, UserExpertiseAssoc, UserRelations} from '../../models';
import {PostgresDbDataSource} from '../../datasources';
import {registerInclusionResolvers} from '../../utils';
import {UserExpertiseAssocRepository} from '../system';

export class UserRepository extends DefaultCrudRepository<
  User,
  typeof User.prototype.id,
  UserRelations
> {
  public readonly userExpertiseAssocs: HasManyRepositoryFactory<
    UserExpertiseAssoc,
    typeof User.prototype.id
  >;

  constructor(
    @inject('datasources.postgresDB') dataSource: PostgresDbDataSource,
    @repository.getter('UserExpertiseAssocRepository')
    userExpertiseAssocRepositoryGetter: Getter<UserExpertiseAssocRepository>,
  ) {
    super(User, dataSource);

    this.userExpertiseAssocs = this.createHasManyRepositoryFactoryFor(
      'userExpertiseAssocs',
      userExpertiseAssocRepositoryGetter,
    );

    registerInclusionResolvers(User, this);
  }
}
