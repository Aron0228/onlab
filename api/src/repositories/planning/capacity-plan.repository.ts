import {Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  HasManyRepositoryFactory,
  repository,
} from '@loopback/repository';
import {PostgresDbDataSource} from '../../datasources';
import {
  CapacityPlan,
  CapacityPlanEntry,
  CapacityPlanRelations,
  IssueAssignment,
  Workspace,
} from '../../models';
import {registerInclusionResolvers} from '../../utils';
import {WorkspaceRepository} from '../system';
import {CapacityPlanEntryRepository} from './capacity-plan-entry.repository';
import {IssueAssignmentRepository} from './issue-assignment.repository';

export class CapacityPlanRepository extends DefaultCrudRepository<
  CapacityPlan,
  typeof CapacityPlan.prototype.id,
  CapacityPlanRelations
> {
  public readonly workspace: BelongsToAccessor<
    Workspace,
    typeof CapacityPlan.prototype.id
  >;

  public readonly entries: HasManyRepositoryFactory<
    CapacityPlanEntry,
    typeof CapacityPlan.prototype.id
  >;

  public readonly issueAssignments: HasManyRepositoryFactory<
    IssueAssignment,
    typeof CapacityPlan.prototype.id
  >;

  constructor(
    @inject('datasources.postgresDB') dataSource: PostgresDbDataSource,
    @repository.getter('WorkspaceRepository')
    workspaceRepositoryGetter: Getter<WorkspaceRepository>,
    @repository.getter('CapacityPlanEntryRepository')
    capacityPlanEntryRepositoryGetter: Getter<CapacityPlanEntryRepository>,
    @repository.getter('IssueAssignmentRepository')
    issueAssignmentRepositoryGetter: Getter<IssueAssignmentRepository>,
  ) {
    super(CapacityPlan, dataSource);

    this.workspace = this.createBelongsToAccessorFor(
      'workspace',
      workspaceRepositoryGetter,
    );

    this.entries = this.createHasManyRepositoryFactoryFor(
      'entries',
      capacityPlanEntryRepositoryGetter,
    );

    this.issueAssignments = this.createHasManyRepositoryFactoryFor(
      'issueAssignments',
      issueAssignmentRepositoryGetter,
    );

    registerInclusionResolvers(CapacityPlan, this);
  }
}
