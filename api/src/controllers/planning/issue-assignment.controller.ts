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
  IssueAssignment,
  IssueAssignmentRelations,
} from '../../models';
import {
  CapacityPlanRepository,
  IssueAssignmentRepository,
} from '../../repositories';
import {
  CapacityPlanningSyncService,
  WorkspaceAuthorizationService,
} from '../../services';

@authenticate('jwt-header')
export class IssueAssignmentController {
  constructor(
    @repository(IssueAssignmentRepository)
    private issueAssignmentRepository: IssueAssignmentRepository,
    @repository(CapacityPlanRepository)
    private capacityPlanRepository: CapacityPlanRepository,
    @service(CapacityPlanningSyncService)
    private capacityPlanningSyncService: CapacityPlanningSyncService,
    @inject('services.WorkspaceAuthorizationService')
    private workspaceAuthorizationService: WorkspaceAuthorizationService,
  ) {}

  @get('/issueAssignments')
  @intercept('interceptors.json-api-serializer')
  public async find(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.query.object('filter') filter?: Filter<IssueAssignment>,
  ): Promise<IssueAssignment[]> {
    const scopedFilter = await this.scopeAssignmentFilter(userProfile, filter);

    return this.issueAssignmentRepository.find(scopedFilter);
  }

  @get('/issueAssignments/count')
  public async count(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.query.object('where') where?: Where<IssueAssignment>,
  ): Promise<Count> {
    const scopedFilter = await this.scopeAssignmentFilter(userProfile, {where});

    return this.issueAssignmentRepository.count(scopedFilter.where);
  }

  @get('/issueAssignments/{id}')
  @intercept('interceptors.json-api-serializer')
  public async findById(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
  ): Promise<IssueAssignment> {
    const assignment = await this.issueAssignmentRepository.findById(id);
    await this.assertCanViewAssignment(userProfile, assignment);

    return assignment;
  }

  @get('/IssueAssignments/{id}/{relationName}')
  @intercept('interceptors.json-api-serializer')
  public async getRelation<K extends keyof IssueAssignmentRelations>(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
    @param.path.string('relationName') relationName: K,
  ): Promise<IssueAssignmentRelations[K]> {
    const assignment = await this.issueAssignmentRepository.findById(id, {
      include: [relationName as string],
    });
    await this.assertCanViewAssignment(userProfile, assignment);

    return (assignment as IssueAssignment & IssueAssignmentRelations)[
      relationName
    ];
  }

  @post('/issueAssignments')
  @intercept('interceptors.json-api-deserializer')
  @intercept('interceptors.json-api-serializer')
  async create(
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
    data: DataObject<IssueAssignment>,
  ): Promise<IssueAssignment> {
    await this.assertCanManagePlan(userProfile, Number(data.capacityPlanId));
    const createdAssignment = await this.issueAssignmentRepository.create(data);

    try {
      await this.capacityPlanningSyncService.syncIssueAssignment(
        createdAssignment,
      );
    } catch (error) {
      console.error('Capacity planning GitHub sync failed', {
        issueAssignmentId: createdAssignment.id,
        error,
      });
    }

    return createdAssignment;
  }

  @patch('/issueAssignments/{id}')
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
    data: DataObject<IssueAssignment>,
  ): Promise<void> {
    const assignment = await this.issueAssignmentRepository.findById(id);
    await this.assertCanManagePlan(userProfile, assignment.capacityPlanId);

    return this.issueAssignmentRepository.updateById(id, data);
  }

  @put('/issueAssignments/{id}')
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
    data: DataObject<IssueAssignment>,
  ): Promise<void> {
    const assignment = await this.issueAssignmentRepository.findById(id);
    await this.assertCanManagePlan(userProfile, assignment.capacityPlanId);

    return this.issueAssignmentRepository.replaceById(id, data);
  }

  @del('/issueAssignments/{id}')
  public async deleteById(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
  ): Promise<void> {
    const assignment = await this.issueAssignmentRepository.findById(id);
    await this.assertCanManagePlan(userProfile, assignment.capacityPlanId);

    return this.issueAssignmentRepository.deleteById(id);
  }

  private async scopeAssignmentFilter(
    userProfile: UserProfile,
    filter: Filter<IssueAssignment> | undefined,
  ): Promise<Filter<IssueAssignment>> {
    const capacityPlanIds = await this.accessibleCapacityPlanIds(userProfile);
    const capacityPlanWhere: Where<IssueAssignment> = {
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

  private async assertCanViewAssignment(
    userProfile: UserProfile,
    assignment: IssueAssignment,
  ): Promise<void> {
    const capacityPlan = await this.capacityPlanRepository.findById(
      assignment.capacityPlanId,
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
