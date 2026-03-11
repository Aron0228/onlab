import {inject, Getter} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  repository,
} from '@loopback/repository';
import {PostgresDbDataSource} from '../../datasources';
import {File, FileRelations, Workspace} from '../../models';
import {WorkspaceRepository} from './workspace.repository';
import {registerInclusionResolvers} from '../../utils';

export class FileRepository extends DefaultCrudRepository<
  File,
  typeof File.prototype.id,
  FileRelations
> {
  public readonly workspace: BelongsToAccessor<
    Workspace,
    typeof File.prototype.id
  >;

  constructor(
    @inject('datasources.postgresDB') dataSource: PostgresDbDataSource,
    @repository.getter('WorkspaceRepository')
    workspaceRepositoryGetter: Getter<WorkspaceRepository>,
  ) {
    super(File, dataSource);

    this.workspace = this.createBelongsToAccessorFor(
      'workspace',
      workspaceRepositoryGetter,
    );

    registerInclusionResolvers(File, this);
  }
}
