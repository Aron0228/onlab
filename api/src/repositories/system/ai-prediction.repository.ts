import {inject} from '@loopback/core';
import {DefaultCrudRepository} from '@loopback/repository';
import {PostgresDbDataSource} from '../../datasources';
import {AIPrediction, AIPredictionRelations} from '../../models';

export class AIPredictionRepository extends DefaultCrudRepository<
  AIPrediction,
  typeof AIPrediction.prototype.id,
  AIPredictionRelations
> {
  constructor(
    @inject('datasources.postgresDB') dataSource: PostgresDbDataSource,
  ) {
    super(AIPrediction, dataSource);
  }
}
