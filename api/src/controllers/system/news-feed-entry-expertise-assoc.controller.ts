import {authenticate} from '@loopback/authentication';
import {inject, intercept} from '@loopback/core';
import {
  Count,
  DataObject,
  Filter,
  Where,
  repository,
} from '@loopback/repository';
import {del, get, param, patch, post, put, requestBody} from '@loopback/rest';
import {SecurityBindings, UserProfile} from '@loopback/security';
import {
  NewsFeedEntryExpertiseAssoc,
  NewsFeedEntryExpertiseAssocRelations,
} from '../../models';
import {
  ExpertiseRepository,
  NewsFeedEntryExpertiseAssocRepository,
  NewsFeedEntryRepository,
} from '../../repositories';
import {WorkspaceAuthorizationService} from '../../services';

@authenticate('jwt-header')
export class NewsFeedEntryExpertiseAssocController {
  constructor(
    @repository(NewsFeedEntryExpertiseAssocRepository)
    private newsFeedEntryExpertiseAssocRepository: NewsFeedEntryExpertiseAssocRepository,
    @repository(NewsFeedEntryRepository)
    private newsFeedEntryRepository: NewsFeedEntryRepository,
    @repository(ExpertiseRepository)
    private expertiseRepository: ExpertiseRepository,
    @inject('services.WorkspaceAuthorizationService')
    private workspaceAuthorizationService: WorkspaceAuthorizationService,
  ) {}

  @get('/newsFeedEntryExpertiseAssocs')
  @intercept('interceptors.json-api-serializer')
  public async find(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.query.object('filter') filter?: Filter<NewsFeedEntryExpertiseAssoc>,
  ): Promise<NewsFeedEntryExpertiseAssoc[]> {
    const scopedFilter = await this.scopeAssocFilter(userProfile, filter);

    return this.newsFeedEntryExpertiseAssocRepository.find(scopedFilter);
  }

  @get('/newsFeedEntryExpertiseAssocs/count')
  public async count(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.query.object('where') where?: Where<NewsFeedEntryExpertiseAssoc>,
  ): Promise<Count> {
    const scopedFilter = await this.scopeAssocFilter(userProfile, {where});

    return this.newsFeedEntryExpertiseAssocRepository.count(scopedFilter.where);
  }

  @get('/newsFeedEntryExpertiseAssocs/{id}')
  @intercept('interceptors.json-api-serializer')
  public async findById(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
  ): Promise<NewsFeedEntryExpertiseAssoc> {
    const assoc = await this.newsFeedEntryExpertiseAssocRepository.findById(id);
    await this.assertCanViewAssoc(userProfile, assoc);

    return assoc;
  }

  @get('/NewsFeedEntryExpertiseAssocs/{id}/{relationName}')
  @intercept('interceptors.json-api-serializer')
  public async getRelation<
    K extends keyof NewsFeedEntryExpertiseAssocRelations,
  >(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
    @param.path.string('relationName') relationName: K,
  ): Promise<NewsFeedEntryExpertiseAssocRelations[K]> {
    const assoc = await this.newsFeedEntryExpertiseAssocRepository.findById(
      id,
      {
        include: [relationName as string],
      },
    );
    await this.assertCanViewAssoc(userProfile, assoc);

    return (
      assoc as NewsFeedEntryExpertiseAssoc &
        NewsFeedEntryExpertiseAssocRelations
    )[relationName];
  }

  @post('/newsFeedEntryExpertiseAssocs')
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
    data: DataObject<NewsFeedEntryExpertiseAssoc>,
  ): Promise<NewsFeedEntryExpertiseAssoc> {
    await this.assertCanManageAssoc(userProfile, {
      newsFeedEntryId: Number(data.newsFeedEntryId),
      expertiseId: Number(data.expertiseId),
    });

    return this.newsFeedEntryExpertiseAssocRepository.create(data);
  }

  @patch('/newsFeedEntryExpertiseAssocs/{id}')
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
    data: DataObject<NewsFeedEntryExpertiseAssoc>,
  ): Promise<void> {
    const assoc = await this.newsFeedEntryExpertiseAssocRepository.findById(id);
    await this.assertCanManageAssoc(userProfile, {...assoc, ...data});

    return this.newsFeedEntryExpertiseAssocRepository.updateById(id, data);
  }

  @put('/newsFeedEntryExpertiseAssocs/{id}')
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
    data: DataObject<NewsFeedEntryExpertiseAssoc>,
  ): Promise<void> {
    const assoc = await this.newsFeedEntryExpertiseAssocRepository.findById(id);
    await this.assertCanManageAssoc(userProfile, {...assoc, ...data});

    return this.newsFeedEntryExpertiseAssocRepository.replaceById(id, data);
  }

  @del('/newsFeedEntryExpertiseAssocs/{id}')
  public async deleteById(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
  ): Promise<void> {
    const assoc = await this.newsFeedEntryExpertiseAssocRepository.findById(id);
    await this.assertCanManageAssoc(userProfile, assoc);

    return this.newsFeedEntryExpertiseAssocRepository.deleteById(id);
  }

  private async scopeAssocFilter(
    userProfile: UserProfile,
    filter: Filter<NewsFeedEntryExpertiseAssoc> | undefined,
  ): Promise<Filter<NewsFeedEntryExpertiseAssoc>> {
    const entryIds = await this.accessibleNewsFeedEntryIds(userProfile);
    const accessWhere: Where<NewsFeedEntryExpertiseAssoc> = {
      newsFeedEntryId: {inq: entryIds},
    };

    return {
      ...filter,
      where: filter?.where ? {and: [filter.where, accessWhere]} : accessWhere,
    };
  }

  private async accessibleNewsFeedEntryIds(
    userProfile: UserProfile,
  ): Promise<number[]> {
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);
    const workspaceIds =
      await this.workspaceAuthorizationService.accessibleWorkspaceIds(userId);
    const entries = await this.newsFeedEntryRepository.find({
      where: {workspaceId: {inq: workspaceIds}},
    });

    return entries.map(entry => entry.id);
  }

  private async assertCanViewAssoc(
    userProfile: UserProfile,
    assoc: NewsFeedEntryExpertiseAssoc,
  ): Promise<void> {
    const entry = await this.newsFeedEntryRepository.findById(
      assoc.newsFeedEntryId,
    );
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);

    await this.workspaceAuthorizationService.assertWorkspaceMember(
      entry.workspaceId,
      userId,
    );
  }

  private async assertCanManageAssoc(
    userProfile: UserProfile,
    assoc: Pick<NewsFeedEntryExpertiseAssoc, 'newsFeedEntryId' | 'expertiseId'>,
  ): Promise<void> {
    const entry = await this.newsFeedEntryRepository.findById(
      assoc.newsFeedEntryId,
    );
    const expertise = await this.expertiseRepository.findById(
      assoc.expertiseId,
    );
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);

    await this.workspaceAuthorizationService.assertWorkspaceAdminOrOwner(
      entry.workspaceId,
      userId,
    );

    if (expertise.workspaceId !== entry.workspaceId) {
      await this.workspaceAuthorizationService.assertWorkspaceAdminOrOwner(
        expertise.workspaceId,
        userId,
      );
    }
  }
}
