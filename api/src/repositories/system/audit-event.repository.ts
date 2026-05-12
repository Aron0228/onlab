import {Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  repository,
} from '@loopback/repository';
import {PostgresDbDataSource} from '../../datasources';
import {AuditEvent, AuditEventRelations, User, Workspace} from '../../models';
import {registerInclusionResolvers} from '../../utils';
import {UserRepository} from '../auth';
import {WorkspaceRepository} from './workspace.repository';

export class AuditEventRepository extends DefaultCrudRepository<
  AuditEvent,
  typeof AuditEvent.prototype.id,
  AuditEventRelations
> {
  public readonly actor: BelongsToAccessor<
    User,
    typeof AuditEvent.prototype.id
  >;

  public readonly workspace: BelongsToAccessor<
    Workspace,
    typeof AuditEvent.prototype.id
  >;

  constructor(
    @inject('datasources.postgresDB') dataSource: PostgresDbDataSource,
    @repository.getter('UserRepository')
    userRepositoryGetter: Getter<UserRepository>,
    @repository.getter('WorkspaceRepository')
    workspaceRepositoryGetter: Getter<WorkspaceRepository>,
  ) {
    super(AuditEvent, dataSource);

    this.actor = this.createBelongsToAccessorFor('actor', userRepositoryGetter);
    this.workspace = this.createBelongsToAccessorFor(
      'workspace',
      workspaceRepositoryGetter,
    );

    registerInclusionResolvers(AuditEvent, this);
  }
}
