import {authenticate} from '@loopback/authentication';
import {intercept, service} from '@loopback/core';
import {inject} from '@loopback/core';
import {param, get} from '@loopback/rest';
import {repository} from '@loopback/repository';
import {SecurityBindings, UserProfile} from '@loopback/security';
import {NewsFeedEntry, NewsFeedEntryRelations} from '../../models';
import {NewsFeedEntryRepository} from '../../repositories';
import {WorkspaceAuthorizationService} from '../../services';
import {createBaseCrudController} from '../base-crud.controller';

const NewsFeedEntryBaseCrudController = createBaseCrudController<
  NewsFeedEntry,
  typeof NewsFeedEntry.prototype.id,
  NewsFeedEntryRelations
>('newsFeedEntries');

@authenticate('jwt-header')
export class NewsFeedEntryController extends NewsFeedEntryBaseCrudController {
  constructor(
    @repository(NewsFeedEntryRepository)
    public repository: NewsFeedEntryRepository,
    @service(WorkspaceAuthorizationService)
    private workspaceAuthorizationService: WorkspaceAuthorizationService,
  ) {
    super(repository);
  }

  @get('/newsFeedEntries/feed')
  @intercept('interceptors.json-api-serializer')
  public async feed(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.query.number('workspaceId') workspaceId: number,
  ): Promise<NewsFeedEntry[]> {
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);
    await this.workspaceAuthorizationService.assertWorkspaceMember(
      workspaceId,
      userId,
    );

    return this.repository.findPersonalizedFeed(workspaceId, userId);
  }
}
