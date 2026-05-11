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
import {CapacityPlan, CapacityPlanRelations} from '../../models';
import {CapacityPlanRepository} from '../../repositories';
import {WorkspaceAuthorizationService} from '../../services';

@authenticate('jwt-header')
export class CapacityPlanController {
  constructor(
    @repository(CapacityPlanRepository)
    private capacityPlanRepository: CapacityPlanRepository,
    @service(WorkspaceAuthorizationService)
    private workspaceAuthorizationService: WorkspaceAuthorizationService,
  ) {}

  @get('/capacityPlans')
  @intercept('interceptors.json-api-serializer')
  public async find(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.query.object('filter') filter?: Filter<CapacityPlan>,
  ): Promise<CapacityPlan[]> {
    const scopedFilter = await this.scopeCapacityPlanFilter(
      userProfile,
      filter,
    );

    return this.capacityPlanRepository.find(scopedFilter);
  }

  @get('/capacityPlans/count')
  public async count(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.query.object('where') where?: Where<CapacityPlan>,
  ): Promise<Count> {
    const scopedFilter = await this.scopeCapacityPlanFilter(userProfile, {
      where,
    });

    return this.capacityPlanRepository.count(scopedFilter.where);
  }

  @get('/capacityPlans/{id}')
  @intercept('interceptors.json-api-serializer')
  public async findById(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
  ): Promise<CapacityPlan> {
    const capacityPlan = await this.capacityPlanRepository.findById(id);
    await this.assertCanViewPlan(userProfile, capacityPlan);

    return capacityPlan;
  }

  @get('/CapacityPlans/{id}/{relationName}')
  @intercept('interceptors.json-api-serializer')
  public async getRelation<K extends keyof CapacityPlanRelations>(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
    @param.path.string('relationName') relationName: K,
  ): Promise<CapacityPlanRelations[K]> {
    const capacityPlan = await this.capacityPlanRepository.findById(id, {
      include: [relationName as string],
    });
    await this.assertCanViewPlan(userProfile, capacityPlan);

    return (capacityPlan as CapacityPlan & CapacityPlanRelations)[relationName];
  }

  @post('/capacityPlans')
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
    data: DataObject<CapacityPlan>,
  ): Promise<CapacityPlan> {
    await this.assertCanManageWorkspace(userProfile, data.workspaceId);

    return this.capacityPlanRepository.create(data);
  }

  @patch('/capacityPlans/{id}')
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
    data: DataObject<CapacityPlan>,
  ): Promise<void> {
    const capacityPlan = await this.capacityPlanRepository.findById(id);
    await this.assertCanManageWorkspace(userProfile, capacityPlan.workspaceId);

    return this.capacityPlanRepository.updateById(id, data);
  }

  @put('/capacityPlans/{id}')
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
    data: DataObject<CapacityPlan>,
  ): Promise<void> {
    const capacityPlan = await this.capacityPlanRepository.findById(id);
    await this.assertCanManageWorkspace(userProfile, capacityPlan.workspaceId);

    return this.capacityPlanRepository.replaceById(id, data);
  }

  @del('/capacityPlans/{id}')
  public async deleteById(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
  ): Promise<void> {
    const capacityPlan = await this.capacityPlanRepository.findById(id);
    await this.assertCanManageWorkspace(userProfile, capacityPlan.workspaceId);

    return this.capacityPlanRepository.deleteById(id);
  }

  private async scopeCapacityPlanFilter(
    userProfile: UserProfile,
    filter: Filter<CapacityPlan> | undefined,
  ): Promise<Filter<CapacityPlan>> {
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);
    const workspaceIds =
      await this.workspaceAuthorizationService.accessibleWorkspaceIds(userId);
    const workspaceWhere: Where<CapacityPlan> = {
      workspaceId: {inq: workspaceIds},
    };

    return {
      ...filter,
      where: filter?.where
        ? {and: [filter.where, workspaceWhere]}
        : workspaceWhere,
    };
  }

  private async assertCanViewPlan(
    userProfile: UserProfile,
    capacityPlan: CapacityPlan,
  ): Promise<void> {
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);

    await this.workspaceAuthorizationService.assertWorkspaceMember(
      capacityPlan.workspaceId,
      userId,
    );
  }

  private async assertCanManageWorkspace(
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
