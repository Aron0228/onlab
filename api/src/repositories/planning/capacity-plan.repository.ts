import {Getter, inject, service} from '@loopback/core';
import {
  BelongsToAccessor,
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
import {QueueService} from '../../services/queue.service';
import {registerInclusionResolvers} from '../../utils';
import {NewsFeedAwareCrudRepository, WorkspaceRepository} from '../system';
import {CapacityPlanEntryRepository} from './capacity-plan-entry.repository';
import {IssueAssignmentRepository} from './issue-assignment.repository';

export class CapacityPlanRepository extends NewsFeedAwareCrudRepository<
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
    @service(QueueService) queueService: QueueService,
    @repository.getter('WorkspaceRepository')
    workspaceRepositoryGetter: Getter<WorkspaceRepository>,
    @repository.getter('CapacityPlanEntryRepository')
    capacityPlanEntryRepositoryGetter: Getter<CapacityPlanEntryRepository>,
    @repository.getter('IssueAssignmentRepository')
    issueAssignmentRepositoryGetter: Getter<IssueAssignmentRepository>,
  ) {
    super(CapacityPlan, dataSource, queueService);

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

  protected async resolveNewsFeedWorkspaceId(
    entity: CapacityPlan,
  ): Promise<number | null> {
    return entity.workspaceId;
  }

  protected async buildNewsFeedPredictionSnapshot({
    current,
  }: {
    eventAction: 'created' | 'updated';
    previous?: CapacityPlan;
    current: CapacityPlan;
  }) {
    const workspace = await this.workspace(current.id);

    return {
      title: `Capacity plan created for ${workspace.name}`,
      summary: `Capacity plan covering ${formatDate(current.start)} to ${formatDate(current.end)} was created.`,
    };
  }

  protected async shouldEnqueueNewsFeedUpdate(): Promise<boolean> {
    return false;
  }
}

function formatDate(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}
