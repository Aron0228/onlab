import {Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  repository,
} from '@loopback/repository';
import {PostgresDbDataSource} from '../../datasources';
import {
  GithubIssue,
  GithubIssueRelations,
  GithubRepository,
} from '../../models';
import {registerInclusionResolvers} from '../../utils';
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

  constructor(
    @inject('datasources.postgresDB') dataSource: PostgresDbDataSource,
    @repository.getter('GithubRepositoryRepository')
    githubRepositoryGetter: Getter<GithubRepositoryRepository>,
  ) {
    super(GithubIssue, dataSource);

    this.repository = this.createBelongsToAccessorFor(
      'repository',
      githubRepositoryGetter,
    );

    registerInclusionResolvers(GithubIssue, this);
  }
}
