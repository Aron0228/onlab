import {intercept} from '@loopback/core';
import {param, get} from '@loopback/rest';
import {repository} from '@loopback/repository';
import {NewsFeedEntry, NewsFeedEntryRelations} from '../../models';
import {NewsFeedEntryRepository} from '../../repositories';
import {createBaseCrudController} from '../base-crud.controller';

const NewsFeedEntryBaseCrudController = createBaseCrudController<
  NewsFeedEntry,
  typeof NewsFeedEntry.prototype.id,
  NewsFeedEntryRelations
>('newsFeedEntries');

export class NewsFeedEntryController extends NewsFeedEntryBaseCrudController {
  constructor(
    @repository(NewsFeedEntryRepository)
    public repository: NewsFeedEntryRepository,
  ) {
    super(repository);
  }

  @get('/newsFeedEntries/feed')
  @intercept('interceptors.json-api-serializer')
  public async feed(
    @param.query.number('workspaceId') workspaceId: number,
    @param.query.number('userId') userId: number,
  ): Promise<NewsFeedEntry[]> {
    return this.repository.findPersonalizedFeed(workspaceId, userId);
  }
}
