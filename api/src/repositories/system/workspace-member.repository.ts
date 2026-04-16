import {Getter, inject, service} from '@loopback/core';
import {BelongsToAccessor, repository} from '@loopback/repository';
import {PostgresDbDataSource} from '../../datasources';
import {
  User,
  Workspace,
  WorkspaceMember,
  WorkspaceMemberRelations,
} from '../../models';
import {QueueService} from '../../services/queue.service';
import {UserRepository} from '../auth';
import {registerInclusionResolvers} from '../../utils';
import {WorkspaceRepository} from './workspace.repository';
import {NewsFeedAwareCrudRepository} from './news-feed-aware-crud.repository';

export class WorkspaceMemberRepository extends NewsFeedAwareCrudRepository<
  WorkspaceMember,
  typeof WorkspaceMember.prototype.id,
  WorkspaceMemberRelations
> {
  public readonly user: BelongsToAccessor<
    User,
    typeof WorkspaceMember.prototype.id
  >;

  public readonly workspace: BelongsToAccessor<
    Workspace,
    typeof WorkspaceMember.prototype.id
  >;

  constructor(
    @inject('datasources.postgresDB') dataSource: PostgresDbDataSource,
    @service(QueueService) queueService: QueueService,
    @repository.getter('UserRepository')
    userRepositoryGetter: Getter<UserRepository>,
    @repository.getter('WorkspaceRepository')
    workspaceRepositoryGetter: Getter<WorkspaceRepository>,
  ) {
    super(WorkspaceMember, dataSource, queueService);

    this.user = this.createBelongsToAccessorFor('user', userRepositoryGetter);
    this.workspace = this.createBelongsToAccessorFor(
      'workspace',
      workspaceRepositoryGetter,
    );

    registerInclusionResolvers(WorkspaceMember, this);
  }

  protected async resolveNewsFeedWorkspaceId(
    entity: WorkspaceMember,
  ): Promise<number | null> {
    return entity.workspaceId ?? null;
  }

  protected async buildNewsFeedPredictionSnapshot({
    current,
  }: {
    eventAction: 'created' | 'updated';
    previous?: WorkspaceMember;
    current: WorkspaceMember;
  }) {
    const user = current.userId ? await this.user(current.id) : null;
    const workspace = current.workspaceId
      ? await this.workspace(current.id)
      : null;

    return {
      title: user
        ? `${user.fullName} joined the workspace`
        : 'New team member added',
      summary: workspace
        ? `${user?.fullName ?? 'A user'} was added to ${workspace.name} as ${current.role ?? 'MEMBER'}.`
        : `${user?.fullName ?? 'A user'} was added to the workspace as ${current.role ?? 'MEMBER'}.`,
    };
  }

  protected async shouldEnqueueNewsFeedCreate(
    entity: WorkspaceMember,
  ): Promise<boolean> {
    void entity;
    return true;
  }

  protected async shouldEnqueueNewsFeedUpdate(): Promise<boolean> {
    return false;
  }
}
