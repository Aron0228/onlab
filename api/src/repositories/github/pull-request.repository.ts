import {Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  repository,
} from '@loopback/repository';
import {PostgresDbDataSource} from '../../datasources';
import {
  GithubPullRequest,
  GithubPullRequestRelations,
  GithubRepository,
  User,
} from '../../models';
import {registerInclusionResolvers} from '../../utils';
import {UserRepository} from '../auth';
import {GithubRepositoryRepository} from './repository.repository';

export class GithubPullRequestRepository extends DefaultCrudRepository<
  GithubPullRequest,
  typeof GithubPullRequest.prototype.id,
  GithubPullRequestRelations
> {
  public readonly repository: BelongsToAccessor<
    GithubRepository,
    typeof GithubPullRequest.prototype.id
  >;
  public readonly author: BelongsToAccessor<
    User,
    typeof GithubPullRequest.prototype.id
  >;

  constructor(
    @inject('datasources.postgresDB') dataSource: PostgresDbDataSource,
    @repository.getter('GithubRepositoryRepository')
    githubRepositoryGetter: Getter<GithubRepositoryRepository>,
    @repository.getter('UserRepository')
    userRepositoryGetter: Getter<UserRepository>,
  ) {
    super(GithubPullRequest, dataSource);

    this.repository = this.createBelongsToAccessorFor(
      'repository',
      githubRepositoryGetter,
    );
    this.author = this.createBelongsToAccessorFor(
      'author',
      userRepositoryGetter,
    );

    registerInclusionResolvers(GithubPullRequest, this);
  }
}
