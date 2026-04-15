import {Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  repository,
} from '@loopback/repository';
import {PostgresDbDataSource} from '../../datasources';
import {
  CapacityPlan,
  CapacityPlanEntry,
  CapacityPlanEntryRelations,
  User,
} from '../../models';
import {registerInclusionResolvers} from '../../utils';
import {UserRepository} from '../auth';
import {CapacityPlanRepository} from './capacity-plan.repository';

export class CapacityPlanEntryRepository extends DefaultCrudRepository<
  CapacityPlanEntry,
  typeof CapacityPlanEntry.prototype.id,
  CapacityPlanEntryRelations
> {
  public readonly capacityPlan: BelongsToAccessor<
    CapacityPlan,
    typeof CapacityPlanEntry.prototype.id
  >;

  public readonly user: BelongsToAccessor<
    User,
    typeof CapacityPlanEntry.prototype.id
  >;

  constructor(
    @inject('datasources.postgresDB') dataSource: PostgresDbDataSource,
    @repository.getter('CapacityPlanRepository')
    capacityPlanRepositoryGetter: Getter<CapacityPlanRepository>,
    @repository.getter('UserRepository')
    userRepositoryGetter: Getter<UserRepository>,
  ) {
    super(CapacityPlanEntry, dataSource);

    this.capacityPlan = this.createBelongsToAccessorFor(
      'capacityPlan',
      capacityPlanRepositoryGetter,
    );
    this.user = this.createBelongsToAccessorFor('user', userRepositoryGetter);

    registerInclusionResolvers(CapacityPlanEntry, this);
  }
}
