import {repository} from '@loopback/repository';
import {Expertise, ExpertiseRelations} from '../../models';
import {ExpertiseRepository} from '../../repositories';
import {createBaseCrudController} from '../base-crud.controller';

const ExpertiseBaseCrudController = createBaseCrudController<
  Expertise,
  typeof Expertise.prototype.id,
  ExpertiseRelations
>('expertises');

export class ExpertiseController extends ExpertiseBaseCrudController {
  constructor(
    @repository(ExpertiseRepository)
    private expertiseRepository: ExpertiseRepository,
  ) {
    super(expertiseRepository);
  }
}
