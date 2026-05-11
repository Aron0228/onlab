import {Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  repository,
} from '@loopback/repository';
import {PostgresDbDataSource} from '../../datasources';
import {
  GithubPullRequest,
  GithubPullRequestReviewer,
  GithubPullRequestReviewerRelations,
  User,
} from '../../models';
import {registerInclusionResolvers} from '../../utils';
import {UserRepository} from '../auth';
import {GithubPullRequestRepository} from './pull-request.repository';

export class GithubPullRequestReviewerRepository extends DefaultCrudRepository<
  GithubPullRequestReviewer,
  typeof GithubPullRequestReviewer.prototype.id,
  GithubPullRequestReviewerRelations
> {
  public readonly pullRequest: BelongsToAccessor<
    GithubPullRequest,
    typeof GithubPullRequestReviewer.prototype.id
  >;
  public readonly user: BelongsToAccessor<
    User,
    typeof GithubPullRequestReviewer.prototype.id
  >;

  constructor(
    @inject('datasources.postgresDB') dataSource: PostgresDbDataSource,
    @repository.getter('GithubPullRequestRepository')
    pullRequestRepositoryGetter: Getter<GithubPullRequestRepository>,
    @repository.getter('UserRepository')
    userRepositoryGetter: Getter<UserRepository>,
  ) {
    super(GithubPullRequestReviewer, dataSource);

    this.pullRequest = this.createBelongsToAccessorFor(
      'pullRequest',
      pullRequestRepositoryGetter,
    );
    this.user = this.createBelongsToAccessorFor('user', userRepositoryGetter);

    registerInclusionResolvers(GithubPullRequestReviewer, this);
  }
}
