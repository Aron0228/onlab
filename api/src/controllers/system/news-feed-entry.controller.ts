import {authenticate} from '@loopback/authentication';
import {inject, intercept, service} from '@loopback/core';
import {
  Count,
  DataObject,
  Filter,
  Where,
  repository,
} from '@loopback/repository';
import {del, get, param, patch, post, put, requestBody} from '@loopback/rest';
import {SecurityBindings, UserProfile} from '@loopback/security';
import {NewsFeedEntry, NewsFeedEntryRelations} from '../../models';
import {NewsFeedEntryRepository} from '../../repositories';
import {WorkspaceAuthorizationService} from '../../services';

@authenticate('jwt-header')
export class NewsFeedEntryController {
  constructor(
    @repository(NewsFeedEntryRepository)
    public repository: NewsFeedEntryRepository,
    @service(WorkspaceAuthorizationService)
    private workspaceAuthorizationService: WorkspaceAuthorizationService,
  ) {}

  @get('/newsFeedEntries')
  @intercept('interceptors.json-api-serializer')
  public async find(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.query.object('filter') filter?: Filter<NewsFeedEntry>,
  ): Promise<NewsFeedEntry[]> {
    const scopedFilter = await this.scopeNewsFeedEntryFilter(
      userProfile,
      filter,
    );

    return this.repository.find(scopedFilter);
  }

  @get('/newsFeedEntries/count')
  public async count(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.query.object('where') where?: Where<NewsFeedEntry>,
  ): Promise<Count> {
    const scopedFilter = await this.scopeNewsFeedEntryFilter(userProfile, {
      where,
    });

    return this.repository.count(scopedFilter.where);
  }

  @get('/newsFeedEntries/feed')
  @intercept('interceptors.json-api-serializer')
  public async feed(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.query.number('workspaceId') workspaceId: number,
    @param.query.number('limit') limit?: number,
    @param.query.number('skip') skip?: number,
    @param.query.boolean('personalized') personalized = true,
  ): Promise<NewsFeedEntry[]> {
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);
    await this.workspaceAuthorizationService.assertWorkspaceMember(
      workspaceId,
      userId,
    );

    const entries = personalized
      ? await this.repository.findPersonalizedFeed(workspaceId, userId)
      : await this.repository.findWorkspaceFeed(workspaceId);
    const safeSkip = Math.max(0, skip ?? 0);
    const safeLimit = limit == null ? undefined : Math.max(0, limit);

    return safeLimit == null
      ? entries.slice(safeSkip)
      : entries.slice(safeSkip, safeSkip + safeLimit);
  }

  @get('/newsFeedEntries/{id}')
  @intercept('interceptors.json-api-serializer')
  public async findById(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
  ): Promise<NewsFeedEntry> {
    const entry = await this.repository.findById(id);
    await this.assertCanViewEntry(userProfile, entry);

    return entry;
  }

  @get('/NewsFeedEntries/{id}/{relationName}')
  @intercept('interceptors.json-api-serializer')
  public async getRelation<K extends keyof NewsFeedEntryRelations>(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
    @param.path.string('relationName') relationName: K,
  ): Promise<NewsFeedEntryRelations[K]> {
    const entry = await this.repository.findById(id, {
      include: [relationName as string],
    });
    await this.assertCanViewEntry(userProfile, entry);

    return (entry as NewsFeedEntry & NewsFeedEntryRelations)[relationName];
  }

  @post('/newsFeedEntries')
  @intercept('interceptors.json-api-deserializer')
  @intercept('interceptors.json-api-serializer')
  public async create(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @requestBody({
      content: {
        'application/vnd.api+json': {
          schema: {'x-ts-type': Object},
        },
      },
    })
    data: DataObject<NewsFeedEntry>,
  ): Promise<NewsFeedEntry> {
    await this.assertCanManageWorkspace(userProfile, Number(data.workspaceId));

    return this.repository.create(data);
  }

  @patch('/newsFeedEntries/{id}')
  @intercept('interceptors.json-api-deserializer')
  public async updateById(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
    @requestBody({
      content: {
        'application/vnd.api+json': {
          schema: {'x-ts-type': Object},
        },
      },
    })
    data: DataObject<NewsFeedEntry>,
  ): Promise<void> {
    const entry = await this.repository.findById(id);
    await this.assertCanManageEntryUpdate(userProfile, entry, data);

    return this.repository.updateById(id, data);
  }

  @put('/newsFeedEntries/{id}')
  @intercept('interceptors.json-api-deserializer')
  public async replaceById(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
    @requestBody({
      content: {
        'application/vnd.api+json': {
          schema: {'x-ts-type': Object},
        },
      },
    })
    data: DataObject<NewsFeedEntry>,
  ): Promise<void> {
    const entry = await this.repository.findById(id);
    await this.assertCanManageEntryUpdate(userProfile, entry, data);

    return this.repository.replaceById(id, data);
  }

  @del('/newsFeedEntries/{id}')
  public async deleteById(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
  ): Promise<void> {
    const entry = await this.repository.findById(id);
    await this.assertCanManageWorkspace(userProfile, entry.workspaceId);

    return this.repository.deleteById(id);
  }

  private async scopeNewsFeedEntryFilter(
    userProfile: UserProfile,
    filter: Filter<NewsFeedEntry> | undefined,
  ): Promise<Filter<NewsFeedEntry>> {
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);
    const workspaceIds =
      await this.workspaceAuthorizationService.accessibleWorkspaceIds(userId);
    const accessWhere: Where<NewsFeedEntry> = {
      workspaceId: {inq: workspaceIds},
    };

    return {
      ...filter,
      where: filter?.where ? {and: [filter.where, accessWhere]} : accessWhere,
    };
  }

  private async assertCanViewEntry(
    userProfile: UserProfile,
    entry: NewsFeedEntry,
  ): Promise<void> {
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);

    await this.workspaceAuthorizationService.assertWorkspaceMember(
      entry.workspaceId,
      userId,
    );
  }

  private async assertCanManageEntryUpdate(
    userProfile: UserProfile,
    entry: NewsFeedEntry,
    data: DataObject<NewsFeedEntry>,
  ): Promise<void> {
    await this.assertCanManageWorkspace(userProfile, entry.workspaceId);

    if (
      data.workspaceId !== undefined &&
      Number(data.workspaceId) !== entry.workspaceId
    ) {
      await this.assertCanManageWorkspace(
        userProfile,
        Number(data.workspaceId),
      );
    }
  }

  private async assertCanManageWorkspace(
    userProfile: UserProfile,
    workspaceId: number,
  ): Promise<void> {
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);

    await this.workspaceAuthorizationService.assertWorkspaceAdminOrOwner(
      workspaceId,
      userId,
    );
  }
}
