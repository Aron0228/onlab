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
  GithubLabel,
  GithubPullRequest,
  GithubRepository,
  GithubRepositoryRelations,
  Workspace,
} from '../../models';
import {registerInclusionResolvers} from '../../utils';
import {GithubIssueRepository} from './issue.repository';
import {GithubLabelRepository} from './label.repository';
import {GithubPullRequestRepository} from './pull-request.repository';
import {WorkspaceRepository} from '../system';

export class GithubRepositoryRepository extends DefaultCrudRepository<
  GithubRepository,
  typeof GithubRepository.prototype.id,
  GithubRepositoryRelations
> {
  private readonly githubIssueRepositoryGetter: Getter<GithubIssueRepository>;
  private readonly githubLabelRepositoryGetter: Getter<GithubLabelRepository>;
  private readonly githubPullRequestRepositoryGetter: Getter<GithubPullRequestRepository>;
  public readonly workspace: BelongsToAccessor<
    Workspace,
    typeof GithubRepository.prototype.id
  >;
  public readonly issues: HasManyRepositoryFactory<
    GithubIssue,
    typeof GithubRepository.prototype.id
  >;
  public readonly labels: HasManyRepositoryFactory<
    GithubLabel,
    typeof GithubRepository.prototype.id
  >;
  public readonly pullRequests: HasManyRepositoryFactory<
    GithubPullRequest,
    typeof GithubRepository.prototype.id
  >;

  constructor(
    @inject('datasources.postgresDB') dataSource: PostgresDbDataSource,
    @repository.getter('WorkspaceRepository')
    workspaceRepositoryGetter: Getter<WorkspaceRepository>,
    @repository.getter('GithubIssueRepository')
    githubIssueRepositoryGetter: Getter<GithubIssueRepository>,
    @repository.getter('GithubLabelRepository')
    githubLabelRepositoryGetter: Getter<GithubLabelRepository>,
    @repository.getter('GithubPullRequestRepository')
    githubPullRequestRepositoryGetter: Getter<GithubPullRequestRepository>,
  ) {
    super(GithubRepository, dataSource);
    this.githubIssueRepositoryGetter = githubIssueRepositoryGetter;
    this.githubLabelRepositoryGetter = githubLabelRepositoryGetter;
    this.githubPullRequestRepositoryGetter = githubPullRequestRepositoryGetter;

    this.workspace = this.createBelongsToAccessorFor(
      'workspace',
      workspaceRepositoryGetter,
    );

    this.issues = this.createHasManyRepositoryFactoryFor(
      'issues',
      githubIssueRepositoryGetter,
    );
    this.labels = this.createHasManyRepositoryFactoryFor(
      'labels',
      githubLabelRepositoryGetter,
    );
    this.pullRequests = this.createHasManyRepositoryFactoryFor(
      'pullRequests',
      githubPullRequestRepositoryGetter,
    );

    registerInclusionResolvers(GithubRepository, this);
  }

  public async deleteCascade(
    repositoryId: typeof GithubRepository.prototype.id,
  ): Promise<void> {
    const githubIssueRepository = await this.githubIssueRepositoryGetter();
    const githubLabelRepository = await this.githubLabelRepositoryGetter();
    const githubPullRequestRepository =
      await this.githubPullRequestRepositoryGetter();

    await githubIssueRepository.deleteAll({repositoryId});
    await githubLabelRepository.deleteAll({repositoryId});
    await githubPullRequestRepository.deleteAll({repositoryId});
    await this.deleteById(repositoryId);
  }
}
