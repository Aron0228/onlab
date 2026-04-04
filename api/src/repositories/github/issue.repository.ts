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
  GithubIssue,
  GithubIssueRelations,
  GithubRepository,
} from '../../models';
import {
  createAIPredictionInclusionResolver,
  registerInclusionResolvers,
} from '../../utils';
import {AIPredictionRepository} from '../system';
import {GithubRepositoryRepository} from './repository.repository';

export class GithubIssueRepository extends DefaultCrudRepository<
  GithubIssue,
  typeof GithubIssue.prototype.id,
  GithubIssueRelations
> {
  public readonly repository: BelongsToAccessor<
    GithubRepository,
    typeof GithubIssue.prototype.id
  >;
  public readonly aiPrediction: {
    inclusionResolver: InclusionResolver<GithubIssue, AIPrediction>;
  };

  constructor(
    @inject('datasources.postgresDB') dataSource: PostgresDbDataSource,
    @repository.getter('GithubRepositoryRepository')
    githubRepositoryGetter: Getter<GithubRepositoryRepository>,
    @repository.getter('AIPredictionRepository')
    aiPredictionRepositoryGetter: Getter<AIPredictionRepository>,
  ) {
    super(GithubIssue, dataSource);

    this.repository = this.createBelongsToAccessorFor(
      'repository',
      githubRepositoryGetter,
    );
    this.aiPrediction = {
      inclusionResolver: createAIPredictionInclusionResolver(
        'github-issue',
        'issue-priority',
        aiPredictionRepositoryGetter,
      ),
    };

    registerInclusionResolvers(GithubIssue, this);
  }
}
