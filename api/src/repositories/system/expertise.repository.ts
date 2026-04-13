import {Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  HasManyRepositoryFactory,
  repository,
} from '@loopback/repository';
import {PostgresDbDataSource} from '../../datasources';
import {
  Expertise,
  ExpertiseRelations,
  UserExpertiseAssoc,
  Workspace,
} from '../../models';
import {registerInclusionResolvers} from '../../utils';
import {WorkspaceRepository} from './workspace.repository';
import {UserExpertiseAssocRepository} from './user-expertise-assoc.repository';

export class ExpertiseRepository extends DefaultCrudRepository<
  Expertise,
  typeof Expertise.prototype.id,
  ExpertiseRelations
> {
  public readonly workspace: BelongsToAccessor<
    Workspace,
    typeof Expertise.prototype.id
  >;

  public readonly userExpertiseAssocs: HasManyRepositoryFactory<
    UserExpertiseAssoc,
    typeof Expertise.prototype.id
  >;

  constructor(
    @inject('datasources.postgresDB') dataSource: PostgresDbDataSource,
    @repository.getter('WorkspaceRepository')
    workspaceRepositoryGetter: Getter<WorkspaceRepository>,
    @repository.getter('UserExpertiseAssocRepository')
    userExpertiseAssocRepositoryGetter: Getter<UserExpertiseAssocRepository>,
  ) {
    super(Expertise, dataSource);

    this.workspace = this.createBelongsToAccessorFor(
      'workspace',
      workspaceRepositoryGetter,
    );

    this.userExpertiseAssocs = this.createHasManyRepositoryFactoryFor(
      'userExpertiseAssocs',
      userExpertiseAssocRepositoryGetter,
    );

    registerInclusionResolvers(Expertise, this);
  }
}
