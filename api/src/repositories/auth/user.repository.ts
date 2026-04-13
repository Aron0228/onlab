import {Getter, inject} from '@loopback/core';
import {
  DefaultCrudRepository,
  HasManyRepositoryFactory,
  repository,
} from '@loopback/repository';
import {
  CapacityPlanEntry,
  IssueAssignment,
  User,
  UserExpertiseAssoc,
  UserRelations,
} from '../../models';
import {PostgresDbDataSource} from '../../datasources';
import {registerInclusionResolvers} from '../../utils';
import {
  CapacityPlanEntryRepository,
  IssueAssignmentRepository,
} from '../planning';
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
  public readonly capacityPlanEntries: HasManyRepositoryFactory<
    CapacityPlanEntry,
    typeof User.prototype.id
  >;
  public readonly issueAssignments: HasManyRepositoryFactory<
    IssueAssignment,
    typeof User.prototype.id
  >;

  constructor(
    @inject('datasources.postgresDB') dataSource: PostgresDbDataSource,
    @repository.getter('UserExpertiseAssocRepository')
    userExpertiseAssocRepositoryGetter: Getter<UserExpertiseAssocRepository>,
    @repository.getter('CapacityPlanEntryRepository')
    capacityPlanEntryRepositoryGetter: Getter<CapacityPlanEntryRepository>,
    @repository.getter('IssueAssignmentRepository')
    issueAssignmentRepositoryGetter: Getter<IssueAssignmentRepository>,
  ) {
    super(User, dataSource);

    this.userExpertiseAssocs = this.createHasManyRepositoryFactoryFor(
      'userExpertiseAssocs',
      userExpertiseAssocRepositoryGetter,
    );

    this.capacityPlanEntries = this.createHasManyRepositoryFactoryFor(
      'capacityPlanEntries',
      capacityPlanEntryRepositoryGetter,
    );

    this.issueAssignments = this.createHasManyRepositoryFactoryFor(
      'issueAssignments',
      issueAssignmentRepositoryGetter,
    );

    registerInclusionResolvers(User, this);
  }
}
