import {Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  repository,
} from '@loopback/repository';
import {PostgresDbDataSource} from '../../datasources';
import {
  Expertise,
  User,
  UserExpertiseAssoc,
  UserExpertiseAssocRelations,
} from '../../models';
import {UserRepository} from '../auth';
import {registerInclusionResolvers} from '../../utils';
import {ExpertiseRepository} from './expertise.repository';

export class UserExpertiseAssocRepository extends DefaultCrudRepository<
  UserExpertiseAssoc,
  typeof UserExpertiseAssoc.prototype.id,
  UserExpertiseAssocRelations
> {
  public readonly user: BelongsToAccessor<
    User,
    typeof UserExpertiseAssoc.prototype.id
  >;

  public readonly expertise: BelongsToAccessor<
    Expertise,
    typeof UserExpertiseAssoc.prototype.id
  >;

  constructor(
    @inject('datasources.postgresDB') dataSource: PostgresDbDataSource,
    @repository.getter('UserRepository')
    userRepositoryGetter: Getter<UserRepository>,
    @repository.getter('ExpertiseRepository')
    expertiseRepositoryGetter: Getter<ExpertiseRepository>,
  ) {
    super(UserExpertiseAssoc, dataSource);

    this.user = this.createBelongsToAccessorFor('user', userRepositoryGetter);
    this.expertise = this.createBelongsToAccessorFor(
      'expertise',
      expertiseRepositoryGetter,
    );

    registerInclusionResolvers(UserExpertiseAssoc, this);
  }
}
