import {repository} from '@loopback/repository';
import {CapacityPlanEntry, CapacityPlanEntryRelations} from '../../models';
import {CapacityPlanEntryRepository} from '../../repositories';
import {createBaseCrudController} from '../base-crud.controller';

const CapacityPlanEntryBaseCrudController = createBaseCrudController<
  CapacityPlanEntry,
  typeof CapacityPlanEntry.prototype.id,
  CapacityPlanEntryRelations
>('capacityPlanEntries');

export class CapacityPlanEntryController extends CapacityPlanEntryBaseCrudController {
  constructor(
    @repository(CapacityPlanEntryRepository)
    private capacityPlanEntryRepository: CapacityPlanEntryRepository,
  ) {
    super(capacityPlanEntryRepository);
  }
}
