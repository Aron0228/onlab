import {Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  repository,
} from '@loopback/repository';
import {PostgresDbDataSource} from '../../datasources';
import {
  User,
  Workspace,
  WorkspaceMember,
  WorkspaceMemberRelations,
} from '../../models';
import {UserRepository} from '../auth';
import {registerInclusionResolvers} from '../../utils';
import {WorkspaceRepository} from './workspace.repository';

export class WorkspaceMemberRepository extends DefaultCrudRepository<
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
    @repository.getter('UserRepository')
    userRepositoryGetter: Getter<UserRepository>,
    @repository.getter('WorkspaceRepository')
    workspaceRepositoryGetter: Getter<WorkspaceRepository>,
  ) {
    super(WorkspaceMember, dataSource);

    this.user = this.createBelongsToAccessorFor('user', userRepositoryGetter);
    this.workspace = this.createBelongsToAccessorFor(
      'workspace',
      workspaceRepositoryGetter,
    );

    registerInclusionResolvers(WorkspaceMember, this);
  }
}
