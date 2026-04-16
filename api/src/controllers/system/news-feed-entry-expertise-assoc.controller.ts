import {repository} from '@loopback/repository';
import {
  NewsFeedEntryExpertiseAssoc,
  NewsFeedEntryExpertiseAssocRelations,
} from '../../models';
import {NewsFeedEntryExpertiseAssocRepository} from '../../repositories';
import {createBaseCrudController} from '../base-crud.controller';

const NewsFeedEntryExpertiseAssocBaseCrudController = createBaseCrudController<
  NewsFeedEntryExpertiseAssoc,
  typeof NewsFeedEntryExpertiseAssoc.prototype.id,
  NewsFeedEntryExpertiseAssocRelations
>('newsFeedEntryExpertiseAssocs');

export class NewsFeedEntryExpertiseAssocController extends NewsFeedEntryExpertiseAssocBaseCrudController {
  constructor(
    @repository(NewsFeedEntryExpertiseAssocRepository)
    private newsFeedEntryExpertiseAssocRepository: NewsFeedEntryExpertiseAssocRepository,
  ) {
    super(newsFeedEntryExpertiseAssocRepository);
  }
}
