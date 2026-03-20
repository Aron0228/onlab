import {Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  HasManyRepositoryFactory,
  repository,
} from '@loopback/repository';
import {PostgresDbDataSource} from '../../datasources';
import {
  GithubIssue,
  GithubRepository,
  GithubRepositoryRelations,
  Workspace,
} from '../../models';
import {registerInclusionResolvers} from '../../utils';
import {GithubIssueRepository} from './issue.repository';
import {WorkspaceRepository} from '../system';

export class GithubRepositoryRepository extends DefaultCrudRepository<
  GithubRepository,
  typeof GithubRepository.prototype.id,
  GithubRepositoryRelations
> {
  private readonly githubIssueRepositoryGetter: Getter<GithubIssueRepository>;
  public readonly workspace: BelongsToAccessor<
    Workspace,
    typeof GithubRepository.prototype.id
  >;
  public readonly issues: HasManyRepositoryFactory<
    GithubIssue,
    typeof GithubRepository.prototype.id
  >;

  constructor(
    @inject('datasources.postgresDB') dataSource: PostgresDbDataSource,
    @repository.getter('WorkspaceRepository')
    workspaceRepositoryGetter: Getter<WorkspaceRepository>,
    @repository.getter('GithubIssueRepository')
    githubIssueRepositoryGetter: Getter<GithubIssueRepository>,
  ) {
    super(GithubRepository, dataSource);
    this.githubIssueRepositoryGetter = githubIssueRepositoryGetter;

    this.workspace = this.createBelongsToAccessorFor(
      'workspace',
      workspaceRepositoryGetter,
    );

    this.issues = this.createHasManyRepositoryFactoryFor(
      'issues',
      githubIssueRepositoryGetter,
    );

    registerInclusionResolvers(GithubRepository, this);
  }

  public async deleteCascade(
    repositoryId: typeof GithubRepository.prototype.id,
  ): Promise<void> {
    const githubIssueRepository = await this.githubIssueRepositoryGetter();

    await githubIssueRepository.deleteAll({repositoryId});
    await this.deleteById(repositoryId);
  }
}
