import {inject} from '@loopback/core';
import {DefaultCrudRepository} from '@loopback/repository';
import {PostgresDbDataSource} from '../../datasources';
import {
  GithubInstallationState,
  GithubInstallationStateRelations,
} from '../../models';

export class GithubInstallationStateRepository extends DefaultCrudRepository<
  GithubInstallationState,
  typeof GithubInstallationState.prototype.nonce,
  GithubInstallationStateRelations
> {
  constructor(
    @inject('datasources.postgresDB') dataSource: PostgresDbDataSource,
  ) {
    super(GithubInstallationState, dataSource);
  }
}
