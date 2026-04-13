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
  File,
  Invitation,
  User,
  Workspace,
  WorkspaceRelations,
} from '../../models';
import {UserRepository} from '../auth';
import {ExpertiseRepository} from './expertise.repository';
import {FileRepository} from './file.repository';
import {InvitationRepository} from './invitation.repository';
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
  public readonly invitations: HasManyRepositoryFactory<
    Invitation,
    typeof Workspace.prototype.id
  >;
  public readonly expertises: HasManyRepositoryFactory<
    Expertise,
    typeof Workspace.prototype.id
  >;

  constructor(
    @inject('datasources.postgresDB') dataSource: PostgresDbDataSource,
    @repository.getter('UserRepository')
    userRepositoryGetter: Getter<UserRepository>,
    @repository.getter('FileRepository')
    fileRepositoryGetter: Getter<FileRepository>,
    @repository.getter('InvitationRepository')
    invitationRepositoryGetter: Getter<InvitationRepository>,
    @repository.getter('ExpertiseRepository')
    expertiseRepositoryGetter: Getter<ExpertiseRepository>,
  ) {
    super(Workspace, dataSource);

    this.owner = this.createBelongsToAccessorFor('owner', userRepositoryGetter);

    this.files = this.createHasManyRepositoryFactoryFor(
      'files',
      fileRepositoryGetter,
    );

    this.invitations = this.createHasManyRepositoryFactoryFor(
      'invitations',
      invitationRepositoryGetter,
    );

    this.expertises = this.createHasManyRepositoryFactoryFor(
      'expertises',
      expertiseRepositoryGetter,
    );

    registerInclusionResolvers(Workspace, this);
  }
}
