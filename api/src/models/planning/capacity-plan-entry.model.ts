import {belongsTo, Entity, model, property} from '@loopback/repository';
import {User} from '../auth';
import {CapacityPlan} from './capacity-plan.model';

@model({
  settings: {
    forceId: false,
    postgresql: {schema: 'planning', table: 'capacity_plan_entry'},
  },
})
export class CapacityPlanEntry extends Entity {
  @property({
    type: 'number',
    id: true,
    generated: true,
  })
  id: number;

  @belongsTo(
    () => CapacityPlan,
    {},
    {
      type: 'number',
      required: true,
      postgresql: {columnName: 'capacity_plan_id'},
    },
  )
  capacityPlanId: number;

  @belongsTo(
    () => User,
    {},
    {
      type: 'number',
      required: true,
      postgresql: {columnName: 'user_id'},
    },
  )
  userId: number;

  @property({
    type: 'number',
    required: true,
    postgresql: {columnName: 'capacity_hours', dataType: 'double precision'},
  })
  capacityHours: number;

  constructor(data?: Partial<CapacityPlanEntry>) {
    super(data);
  }
}

export type CapacityPlanEntryRelations = {
  capacityPlan?: CapacityPlan;
  user?: User;
};

export type CapacityPlanEntryWithRelations = CapacityPlanEntry &
  CapacityPlanEntryRelations;
