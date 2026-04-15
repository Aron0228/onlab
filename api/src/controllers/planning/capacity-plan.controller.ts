import {repository} from '@loopback/repository';
import {CapacityPlan, CapacityPlanRelations} from '../../models';
import {CapacityPlanRepository} from '../../repositories';
import {createBaseCrudController} from '../base-crud.controller';

const CapacityPlanBaseCrudController = createBaseCrudController<
  CapacityPlan,
  typeof CapacityPlan.prototype.id,
  CapacityPlanRelations
>('capacityPlans');

export class CapacityPlanController extends CapacityPlanBaseCrudController {
  constructor(
    @repository(CapacityPlanRepository)
    private capacityPlanRepository: CapacityPlanRepository,
  ) {
    super(capacityPlanRepository);
  }
}
