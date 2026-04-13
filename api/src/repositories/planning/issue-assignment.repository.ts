import {Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  repository,
} from '@loopback/repository';
import {PostgresDbDataSource} from '../../datasources';
import {
  CapacityPlan,
  GithubIssue,
  IssueAssignment,
  IssueAssignmentRelations,
  User,
} from '../../models';
import {registerInclusionResolvers} from '../../utils';
import {UserRepository} from '../auth';
import {GithubIssueRepository} from '../github';
import {CapacityPlanRepository} from './capacity-plan.repository';

export class IssueAssignmentRepository extends DefaultCrudRepository<
  IssueAssignment,
  typeof IssueAssignment.prototype.id,
  IssueAssignmentRelations
> {
  public readonly issue: BelongsToAccessor<
    GithubIssue,
    typeof IssueAssignment.prototype.id
  >;

  public readonly user: BelongsToAccessor<
    User,
    typeof IssueAssignment.prototype.id
  >;

  public readonly capacityPlan: BelongsToAccessor<
    CapacityPlan,
    typeof IssueAssignment.prototype.id
  >;

  constructor(
    @inject('datasources.postgresDB') dataSource: PostgresDbDataSource,
    @repository.getter('GithubIssueRepository')
    githubIssueRepositoryGetter: Getter<GithubIssueRepository>,
    @repository.getter('UserRepository')
    userRepositoryGetter: Getter<UserRepository>,
    @repository.getter('CapacityPlanRepository')
    capacityPlanRepositoryGetter: Getter<CapacityPlanRepository>,
  ) {
    super(IssueAssignment, dataSource);

    this.issue = this.createBelongsToAccessorFor(
      'issue',
      githubIssueRepositoryGetter,
    );
    this.user = this.createBelongsToAccessorFor('user', userRepositoryGetter);
    this.capacityPlan = this.createBelongsToAccessorFor(
      'capacityPlan',
      capacityPlanRepositoryGetter,
    );

    registerInclusionResolvers(IssueAssignment, this);
  }
}
