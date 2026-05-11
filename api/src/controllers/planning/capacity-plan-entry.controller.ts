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
import {
  CapacityPlan,
  CapacityPlanEntry,
  CapacityPlanEntryRelations,
} from '../../models';
import {
  CapacityPlanEntryRepository,
  CapacityPlanRepository,
} from '../../repositories';
import {WorkspaceAuthorizationService} from '../../services';

@authenticate('jwt-header')
export class CapacityPlanEntryController {
  constructor(
    @repository(CapacityPlanEntryRepository)
    private capacityPlanEntryRepository: CapacityPlanEntryRepository,
    @repository(CapacityPlanRepository)
    private capacityPlanRepository: CapacityPlanRepository,
    @service(WorkspaceAuthorizationService)
    private workspaceAuthorizationService: WorkspaceAuthorizationService,
  ) {}

  @get('/capacityPlanEntries')
  @intercept('interceptors.json-api-serializer')
  public async find(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.query.object('filter') filter?: Filter<CapacityPlanEntry>,
  ): Promise<CapacityPlanEntry[]> {
    const scopedFilter = await this.scopeEntryFilter(userProfile, filter);

    return this.capacityPlanEntryRepository.find(scopedFilter);
  }

  @get('/capacityPlanEntries/count')
  public async count(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.query.object('where') where?: Where<CapacityPlanEntry>,
  ): Promise<Count> {
    const scopedFilter = await this.scopeEntryFilter(userProfile, {where});

    return this.capacityPlanEntryRepository.count(scopedFilter.where);
  }

  @get('/capacityPlanEntries/{id}')
  @intercept('interceptors.json-api-serializer')
  public async findById(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
  ): Promise<CapacityPlanEntry> {
    const entry = await this.capacityPlanEntryRepository.findById(id);
    await this.assertCanViewEntry(userProfile, entry);

    return entry;
  }

  @get('/CapacityPlanEntries/{id}/{relationName}')
  @intercept('interceptors.json-api-serializer')
  public async getRelation<K extends keyof CapacityPlanEntryRelations>(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
    @param.path.string('relationName') relationName: K,
  ): Promise<CapacityPlanEntryRelations[K]> {
    const entry = await this.capacityPlanEntryRepository.findById(id, {
      include: [relationName as string],
    });
    await this.assertCanViewEntry(userProfile, entry);

    return (entry as CapacityPlanEntry & CapacityPlanEntryRelations)[
      relationName
    ];
  }

  @post('/capacityPlanEntries')
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
    data: DataObject<CapacityPlanEntry>,
  ): Promise<CapacityPlanEntry> {
    await this.assertCanManagePlan(userProfile, Number(data.capacityPlanId));

    return this.capacityPlanEntryRepository.create(data);
  }

  @patch('/capacityPlanEntries/{id}')
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
    data: DataObject<CapacityPlanEntry>,
  ): Promise<void> {
    const entry = await this.capacityPlanEntryRepository.findById(id);
    await this.assertCanManagePlan(userProfile, entry.capacityPlanId);

    return this.capacityPlanEntryRepository.updateById(id, data);
  }

  @put('/capacityPlanEntries/{id}')
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
    data: DataObject<CapacityPlanEntry>,
  ): Promise<void> {
    const entry = await this.capacityPlanEntryRepository.findById(id);
    await this.assertCanManagePlan(userProfile, entry.capacityPlanId);

    return this.capacityPlanEntryRepository.replaceById(id, data);
  }

  @del('/capacityPlanEntries/{id}')
  public async deleteById(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
  ): Promise<void> {
    const entry = await this.capacityPlanEntryRepository.findById(id);
    await this.assertCanManagePlan(userProfile, entry.capacityPlanId);

    return this.capacityPlanEntryRepository.deleteById(id);
  }

  private async scopeEntryFilter(
    userProfile: UserProfile,
    filter: Filter<CapacityPlanEntry> | undefined,
  ): Promise<Filter<CapacityPlanEntry>> {
    const capacityPlanIds = await this.accessibleCapacityPlanIds(userProfile);
    const capacityPlanWhere: Where<CapacityPlanEntry> = {
      capacityPlanId: {inq: capacityPlanIds},
    };

    return {
      ...filter,
      where: filter?.where
        ? {and: [filter.where, capacityPlanWhere]}
        : capacityPlanWhere,
    };
  }

  private async accessibleCapacityPlanIds(
    userProfile: UserProfile,
  ): Promise<number[]> {
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);
    const workspaceIds =
      await this.workspaceAuthorizationService.accessibleWorkspaceIds(userId);
    const capacityPlans = await this.capacityPlanRepository.find({
      where: {workspaceId: {inq: workspaceIds}},
    });

    return capacityPlans.map(plan => plan.id);
  }

  private async assertCanViewEntry(
    userProfile: UserProfile,
    entry: CapacityPlanEntry,
  ): Promise<void> {
    const capacityPlan = await this.capacityPlanRepository.findById(
      entry.capacityPlanId,
    );
    await this.assertCanViewPlan(userProfile, capacityPlan);
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

  private async assertCanManagePlan(
    userProfile: UserProfile,
    capacityPlanId: number,
  ): Promise<void> {
    const capacityPlan =
      await this.capacityPlanRepository.findById(capacityPlanId);
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);

    await this.workspaceAuthorizationService.assertWorkspaceAdminOrOwner(
      capacityPlan.workspaceId,
      userId,
    );
  }
}
