import {Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  HasManyRepositoryFactory,
  repository,
} from '@loopback/repository';
import {PostgresDbDataSource} from '../../datasources';
import {File, User, Workspace, WorkspaceRelations} from '../../models';
import {UserRepository} from '../auth';
import {FileRepository} from './file.repository';
import {registerInclusionResolvers} from '../../utils';

export class WorkspaceRepository extends DefaultCrudRepository<
  Workspace,
  typeof Workspace.prototype.id,
  WorkspaceRelations
> {
  public readonly owner: BelongsToAccessor<User, typeof Workspace.prototype.id>;
  public readonly files: HasManyRepositoryFactory<
    File,
    typeof Workspace.prototype.id
  >;

  constructor(
    @inject('datasources.postgresDB') dataSource: PostgresDbDataSource,
    @repository.getter('UserRepository')
    userRepositoryGetter: Getter<UserRepository>,
    @repository.getter('FileRepository')
    fileRepositoryGetter: Getter<FileRepository>,
  ) {
    super(Workspace, dataSource);

    this.owner = this.createBelongsToAccessorFor('owner', userRepositoryGetter);

    this.files = this.createHasManyRepositoryFactoryFor(
      'files',
      fileRepositoryGetter,
    );

    registerInclusionResolvers(Workspace, this);
  }
}
