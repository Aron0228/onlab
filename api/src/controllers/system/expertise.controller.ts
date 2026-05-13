import {authenticate} from '@loopback/authentication';
import {inject, intercept, service} from '@loopback/core';
import {Count, DataObject, Filter, Where} from '@loopback/repository';
import {repository} from '@loopback/repository';
import {del, get, param, patch, post, put, requestBody} from '@loopback/rest';
import {SecurityBindings, UserProfile} from '@loopback/security';
import {Expertise, ExpertiseRelations} from '../../models';
import {ExpertiseRepository} from '../../repositories';
import {
  ExpertiseCatalogService,
  WorkspaceAuthorizationService,
} from '../../services';

@authenticate('jwt-header')
export class ExpertiseController {
  constructor(
    @repository(ExpertiseRepository)
    private expertiseRepository: ExpertiseRepository,
    @service(WorkspaceAuthorizationService)
    private workspaceAuthorizationService: WorkspaceAuthorizationService,
    @service(ExpertiseCatalogService)
    private expertiseCatalogService: ExpertiseCatalogService,
  ) {}

  @get('/expertises')
  @intercept('interceptors.json-api-serializer')
  public async find(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.query.object('filter') filter?: Filter<Expertise>,
  ): Promise<Expertise[]> {
    const scopedFilter = await this.scopeExpertiseFilter(userProfile, filter);

    return this.expertiseRepository.find(scopedFilter);
  }

  @get('/expertises/count')
  public async count(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.query.object('where') where?: Where<Expertise>,
  ): Promise<Count> {
    const scopedFilter = await this.scopeExpertiseFilter(userProfile, {where});

    return this.expertiseRepository.count(scopedFilter.where);
  }

  @get('/expertises/{id}')
  @intercept('interceptors.json-api-serializer')
  public async findById(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
  ): Promise<Expertise> {
    const expertise = await this.expertiseRepository.findById(id);
    await this.assertCanViewExpertise(userProfile, expertise);

    return expertise;
  }

  @get('/Expertises/{id}/{relationName}')
  @intercept('interceptors.json-api-serializer')
  public async getRelation<K extends keyof ExpertiseRelations>(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
    @param.path.string('relationName') relationName: K,
  ): Promise<ExpertiseRelations[K]> {
    const expertise = await this.expertiseRepository.findById(id, {
      include: [relationName as string],
    });
    await this.assertCanViewExpertise(userProfile, expertise);

    return (expertise as Expertise & ExpertiseRelations)[relationName];
  }

  @post('/expertises')
  @intercept('interceptors.json-api-deserializer')
  @intercept('interceptors.json-api-serializer')
  public async create(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @requestBody({
      content: {
        'application/vnd.api+json': {
          schema: {
            'x-ts-type': Object,
          },
        },
      },
    })
    data: DataObject<Expertise>,
  ): Promise<Expertise> {
    await this.assertCanManageExpertise(userProfile, data.workspaceId);

    return this.expertiseCatalogService.createExpertise(data);
  }

  @patch('/expertises/{id}')
  @intercept('interceptors.json-api-deserializer')
  public async updateById(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
    @requestBody({
      content: {
        'application/vnd.api+json': {
          schema: {
            'x-ts-type': Object,
          },
        },
      },
    })
    data: DataObject<Expertise>,
  ): Promise<void> {
    const expertise = await this.expertiseRepository.findById(id);
    await this.assertCanManageExpertise(userProfile, expertise.workspaceId);

    return this.expertiseCatalogService.updateExpertise(id, data);
  }

  @put('/expertises/{id}')
  @intercept('interceptors.json-api-deserializer')
  public async replaceById(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
    @requestBody({
      content: {
        'application/vnd.api+json': {
          schema: {
            'x-ts-type': Object,
          },
        },
      },
    })
    data: DataObject<Expertise>,
  ): Promise<void> {
    const expertise = await this.expertiseRepository.findById(id);
    await this.assertCanManageExpertise(userProfile, expertise.workspaceId);

    return this.expertiseCatalogService.replaceExpertise(id, data);
  }

  @del('/expertises/{id}')
  public async deleteById(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
  ): Promise<void> {
    const expertise = await this.expertiseRepository.findById(id);
    await this.assertCanManageExpertise(userProfile, expertise.workspaceId);

    return this.expertiseRepository.deleteById(id);
  }

  private async scopeExpertiseFilter(
    userProfile: UserProfile,
    filter: Filter<Expertise> | undefined,
  ): Promise<Filter<Expertise>> {
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);
    const workspaceIds =
      await this.workspaceAuthorizationService.accessibleWorkspaceIds(userId);
    const workspaceWhere: Where<Expertise> = {workspaceId: {inq: workspaceIds}};

    return {
      ...filter,
      where: filter?.where
        ? {and: [filter.where, workspaceWhere]}
        : workspaceWhere,
    };
  }

  private async assertCanViewExpertise(
    userProfile: UserProfile,
    expertise: Expertise,
  ): Promise<void> {
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);

    await this.workspaceAuthorizationService.assertWorkspaceMember(
      expertise.workspaceId,
      userId,
    );
  }

  private async assertCanManageExpertise(
    userProfile: UserProfile,
    workspaceId: number | undefined,
  ): Promise<void> {
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);

    await this.workspaceAuthorizationService.assertWorkspaceAdminOrOwner(
      Number(workspaceId),
      userId,
    );
  }
}
