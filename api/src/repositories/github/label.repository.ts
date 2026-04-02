import {Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  repository,
} from '@loopback/repository';
import {PostgresDbDataSource} from '../../datasources';
import {
  GithubLabel,
  GithubLabelRelations,
  GithubRepository,
} from '../../models';
import {registerInclusionResolvers} from '../../utils';
import {GithubRepositoryRepository} from './repository.repository';

export class GithubLabelRepository extends DefaultCrudRepository<
  GithubLabel,
  typeof GithubLabel.prototype.id,
  GithubLabelRelations
> {
  public readonly repository: BelongsToAccessor<
    GithubRepository,
    typeof GithubLabel.prototype.id
  >;

  constructor(
    @inject('datasources.postgresDB') dataSource: PostgresDbDataSource,
    @repository.getter('GithubRepositoryRepository')
    githubRepositoryGetter: Getter<GithubRepositoryRepository>,
  ) {
    super(GithubLabel, dataSource);

    this.repository = this.createBelongsToAccessorFor(
      'repository',
      githubRepositoryGetter,
    );

    registerInclusionResolvers(GithubLabel, this);
  }
}
