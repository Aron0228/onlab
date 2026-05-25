import {authenticate} from '@loopback/authentication';
import {authorize} from '@loopback/authorization';
import {inject, intercept} from '@loopback/core';
import {Count, DataObject, Filter, Where} from '@loopback/repository';
import {repository} from '@loopback/repository';
import {del, get, param, patch, post, put, requestBody} from '@loopback/rest';
import {SecurityBindings, UserProfile} from '@loopback/security';
import {WORKSPACE_PERMISSION, WorkspacePermission} from '../../constants';
import {Workspace, WorkspaceRelations} from '../../models';
import {
  ChannelMemberRepository,
  ChannelRepository,
  WorkspaceRepository,
} from '../../repositories';
import {
  AuditEventService,
  WorkspaceAuthorizationService,
  WorkspaceService,
} from '../../services';
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

type WorkspaceNavigationItem = {
  id: string;
  label: string;
  iconName: string;
  route: string;
  query?: Record<string, unknown>;
};

type WorkspaceNavigationChannel = {
  id: number;
  name: string;
};

type WorkspaceNavigation = {
  items: WorkspaceNavigationItem[];
  channels: WorkspaceNavigationChannel[];
  canCreateChannels: boolean;
  canManageGithubInstallation: boolean;
};

const WORKSPACE_NAVIGATION_ITEMS: Array<
  WorkspaceNavigationItem & {permission: WorkspacePermission}
> = [
  {
    id: 'news-feed',
    label: 'News Feed',
    iconName: 'news',
    route: 'workspaces.edit.news-feed',
    permission: WORKSPACE_PERMISSION.WORKSPACE_VIEW,
  },
  {
    id: 'direct-messages',
    label: 'Direct Messages',
    iconName: 'message-circle',
    route: 'workspaces.edit.communication',
    query: {channelId: null},
    permission: WORKSPACE_PERMISSION.COMMUNICATION_VIEW,
  },
  {
    id: 'issues',
    label: 'Issues',
    iconName: 'exclamation-circle',
    route: 'workspaces.edit.issues',
    permission: WORKSPACE_PERMISSION.GITHUB_ISSUE_MANAGE,
  },
  {
    id: 'pull-requests',
    label: 'Pull Requests',
    iconName: 'git-pull-request',
    route: 'workspaces.edit.pull-requests',
    permission: WORKSPACE_PERMISSION.GITHUB_PULL_REQUEST_VIEW,
  },
  {
    id: 'capacity-planning',
    label: 'Capacity Planning',
    iconName: 'calendar-event',
    route: 'workspaces.edit.capacity-planning',
    permission: WORKSPACE_PERMISSION.CAPACITY_PLAN_MANAGE,
  },
  {
    id: 'settings',
    label: 'Settings',
    iconName: 'settings',
    route: 'workspaces.edit.settings',
    permission: WORKSPACE_PERMISSION.WORKSPACE_SETTINGS_MANAGE,
  },
];

@authenticate('jwt-header')
export class WorkspaceController {
  constructor(
    @repository(WorkspaceRepository)
    private workspaceRepository: WorkspaceRepository,
    @repository(ChannelRepository)
    private channelRepository: ChannelRepository,
    @repository(ChannelMemberRepository)
    private channelMemberRepository: ChannelMemberRepository,
    @inject('services.WorkspaceAuthorizationService')
    private workspaceAuthorizationService: WorkspaceAuthorizationService,
    @inject('services.AuditEventService')
    private auditEventService: AuditEventService,
    @inject('services.WorkspaceService')
    private workspaceService: WorkspaceService,
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

  @get('/workspaces/{id}/navigation')
  public async navigation(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
  ): Promise<WorkspaceNavigation> {
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);
    await this.workspaceAuthorizationService.assertWorkspaceMember(id, userId);

    const permissionDecisions = await Promise.all(
      WORKSPACE_NAVIGATION_ITEMS.map(item =>
        this.workspaceAuthorizationService.checkPermission(
          id,
          userId,
          item.permission,
        ),
      ),
    );
    const allowedItems = WORKSPACE_NAVIGATION_ITEMS.filter(
      (_item, index) => permissionDecisions[index]?.allowed,
    ).map(item => ({
      id: item.id,
      label: item.label,
      iconName: item.iconName,
      route: item.route,
      query: item.query,
    }));
    const canViewCommunication =
      permissionDecisions[
        WORKSPACE_NAVIGATION_ITEMS.findIndex(
          item => item.id === 'direct-messages',
        )
      ]?.allowed ?? false;
    const canCreateChannels = (
      await this.workspaceAuthorizationService.checkPermission(
        id,
        userId,
        WORKSPACE_PERMISSION.COMMUNICATION_MANAGE,
      )
    ).allowed;
    const canManageGithubInstallation = (
      await this.workspaceAuthorizationService.checkPermission(
        id,
        userId,
        WORKSPACE_PERMISSION.GITHUB_INSTALL_MANAGE,
      )
    ).allowed;

    if (!canViewCommunication) {
      return {
        items: allowedItems,
        channels: [],
        canCreateChannels: false,
        canManageGithubInstallation,
      };
    }

    const memberships = await this.channelMemberRepository.find({
      where: {userId},
    });
    const channelIds = memberships
      .map(membership => membership.channelId)
      .filter(
        (channelId): channelId is number => typeof channelId === 'number',
      );
    const channels = channelIds.length
      ? await this.channelRepository.find({
          where: {
            id: {inq: channelIds},
            workspaceId: id,
            type: 'GROUP',
          },
          order: ['id ASC'],
        })
      : [];

    return {
      items: allowedItems,
      channels: channels.map(channel => ({
        id: channel.id,
        name: channel.name ?? 'untitled',
      })),
      canCreateChannels,
      canManageGithubInstallation,
    };
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

    const workspace = await this.workspaceRepository.create({
      ...data,
      ownerId: userId,
    });

    await this.auditEventService.record({
      actorUserId: userId,
      workspaceId: workspace.id,
      action: 'workspace.created',
      resourceType: 'workspace',
      resourceId: String(workspace.id),
      payload: {name: workspace.name},
    });

    return workspace;
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

    await this.workspaceRepository.updateById(id, data);

    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);
    await this.auditEventService.record({
      actorUserId: userId,
      workspaceId: id,
      action: 'workspace.updated',
      resourceType: 'workspace',
      resourceId: String(id),
      payload: {changedFields: Object.keys(data)},
    });
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

    await this.workspaceRepository.replaceById(id, data);

    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);
    await this.auditEventService.record({
      actorUserId: userId,
      workspaceId: id,
      action: 'workspace.replaced',
      resourceType: 'workspace',
      resourceId: String(id),
      payload: {changedFields: Object.keys(data)},
    });
  }

  @authorize({
    resource: WORKSPACE_PERMISSION.WORKSPACE_DELETE,
    voters: [WORKSPACE_AUTHORIZER],
  })
  @del('/workspaces/{id}')
  public async deleteById(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @param.path.number('id') id: number,
    @param.query.string('confirmationName') confirmationName?: string,
  ): Promise<void> {
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);

    await this.workspaceService.softDeleteWorkspace({
      workspaceId: id,
      actorUserId: userId,
      confirmationName,
    });
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
