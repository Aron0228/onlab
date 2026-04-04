import {Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  InclusionResolver,
  repository,
} from '@loopback/repository';
import {PostgresDbDataSource} from '../../datasources';
import {
  AIPrediction,
  GithubPullRequest,
  GithubPullRequestRelations,
  GithubRepository,
  User,
} from '../../models';
import {
  createAIPredictionInclusionResolver,
  registerInclusionResolvers,
} from '../../utils';
import {UserRepository} from '../auth';
import {AIPredictionRepository} from '../system';
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
  public readonly aiPrediction: {
    inclusionResolver: InclusionResolver<GithubPullRequest, AIPrediction>;
  };

  constructor(
    @inject('datasources.postgresDB') dataSource: PostgresDbDataSource,
    @repository.getter('GithubRepositoryRepository')
    githubRepositoryGetter: Getter<GithubRepositoryRepository>,
    @repository.getter('UserRepository')
    userRepositoryGetter: Getter<UserRepository>,
    @repository.getter('AIPredictionRepository')
    aiPredictionRepositoryGetter: Getter<AIPredictionRepository>,
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
    this.aiPrediction = {
      inclusionResolver: createAIPredictionInclusionResolver(
        'github-pull-request',
        'pull-request-merge-risk',
        aiPredictionRepositoryGetter,
      ),
    };

    registerInclusionResolvers(GithubPullRequest, this);
  }
}
