import {DefaultCrudRepository} from '@loopback/repository';
import {User, UserRelations} from '../../models';
import {inject} from '@loopback/core';
import {PostgresDbDataSource} from '../../datasources';

export class UserRepository extends DefaultCrudRepository<
  User,
  typeof User.prototype.id,
  UserRelations
> {
  constructor(
    @inject('datasources.postgresDB') dataSource: PostgresDbDataSource,
  ) {
    super(User, dataSource);
  }
}
