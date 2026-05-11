import {authenticate} from '@loopback/authentication';
import {authorize} from '@loopback/authorization';
import {inject, intercept} from '@loopback/core';
import {Count, DataObject, Filter, Where} from '@loopback/repository';
import {repository} from '@loopback/repository';
import {del, get, param, patch, post, put, requestBody} from '@loopback/rest';
import {SecurityBindings, UserProfile} from '@loopback/security';
import {WORKSPACE_PERMISSION} from '../../constants';
import {Workspace, WorkspaceRelations} from '../../models';
import {WorkspaceRepository} from '../../repositories';
import {WorkspaceAuthorizationService} from '../../services';
import {WORKSPACE_AUTHORIZER} from '../../authorization/workspace-authorizer.provider';

const OWNER_ONLY_WORKSPACE_FIELDS = new Set<keyof Workspace>([
  'githubInstallationId',
  'issueSync',
  'issueSyncDone',
  'prSyncDone',
  'capacityPlanningSync',
  'prRiskPredictionSync',
  'reviewerSuggestionSync',
  'prReviewReminderCron',
]);

@authenticate('jwt-header')
export class WorkspaceController {
  constructor(
    @repository(WorkspaceRepository)
    private workspaceRepository: WorkspaceRepository,
    @inject('services.WorkspaceAuthorizationService')
    private workspaceAuthorizationService: WorkspaceAuthorizationService,
  ) {}

  @get('/workspaces')
  @intercept('interceptors.json-api-serializer')
  public async find(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.query.object('filter') filter?: Filter<Workspace>,
  ): Promise<Workspace[]> {
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);
    const scopedFilter =
      await this.workspaceAuthorizationService.mergeWorkspaceAccessFilter(
        filter,
        userId,
      );

    return this.workspaceRepository.find(scopedFilter);
  }

  @get('/workspaces/count')
  public async count(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.query.object('where') where?: Where<Workspace>,
  ): Promise<Count> {
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);
    const scopedFilter =
      await this.workspaceAuthorizationService.mergeWorkspaceAccessFilter(
        {where},
        userId,
      );

    return this.workspaceRepository.count(scopedFilter.where);
  }

  @authorize({
    resource: WORKSPACE_PERMISSION.WORKSPACE_VIEW,
    voters: [WORKSPACE_AUTHORIZER],
  })
  @get('/workspaces/{id}')
  @intercept('interceptors.json-api-serializer')
  public async findById(
    @param.path.number('id') id: number,
  ): Promise<Workspace> {
    return this.workspaceRepository.findById(id);
  }

  @get('/Workspaces/{id}/{relationName}')
  @intercept('interceptors.json-api-serializer')
  public async getRelation<K extends keyof WorkspaceRelations>(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
    @param.path.string('relationName') relationName: K,
  ): Promise<WorkspaceRelations[K]> {
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);
    await this.workspaceAuthorizationService.assertWorkspaceMember(id, userId);

    const entity: Workspace & WorkspaceRelations =
      await this.workspaceRepository.findById(id, {
        include: [relationName as string],
      });

    return entity[relationName];
  }

  @post('/workspaces')
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
    data: DataObject<Workspace>,
  ): Promise<Workspace> {
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);

    return this.workspaceRepository.create({
      ...data,
      ownerId: userId,
    });
  }

  @authorize({
    resource: WORKSPACE_PERMISSION.WORKSPACE_SETTINGS_MANAGE,
    voters: [WORKSPACE_AUTHORIZER],
  })
  @patch('/workspaces/{id}')
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
    data: DataObject<Workspace>,
  ): Promise<void> {
    await this.assertOwnerForSensitiveWorkspaceFields(id, userProfile, data);

    return this.workspaceRepository.updateById(id, data);
  }

  @authorize({
    resource: WORKSPACE_PERMISSION.WORKSPACE_SETTINGS_MANAGE,
    voters: [WORKSPACE_AUTHORIZER],
  })
  @put('/workspaces/{id}')
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
    data: DataObject<Workspace>,
  ): Promise<void> {
    await this.assertOwnerForSensitiveWorkspaceFields(id, userProfile, data);

    return this.workspaceRepository.replaceById(id, data);
  }

  @authorize({
    resource: WORKSPACE_PERMISSION.WORKSPACE_DELETE,
    voters: [WORKSPACE_AUTHORIZER],
  })
  @del('/workspaces/{id}')
  public async deleteById(@param.path.number('id') id: number): Promise<void> {
    return this.workspaceRepository.deleteById(id);
  }

  @patch('/workspaces')
  public async updateAll(): Promise<Count> {
    return {count: 0};
  }

  @del('/workspaces')
  public async deleteAll(): Promise<Count> {
    return {count: 0};
  }

  private async assertOwnerForSensitiveWorkspaceFields(
    workspaceId: number,
    userProfile: UserProfile,
    data: DataObject<Workspace>,
  ): Promise<void> {
    if (
      !Object.keys(data).some(key =>
        OWNER_ONLY_WORKSPACE_FIELDS.has(key as keyof Workspace),
      )
    ) {
      return;
    }

    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);

    await this.workspaceAuthorizationService.assertWorkspaceOwner(
      workspaceId,
      userId,
    );
  }
}
