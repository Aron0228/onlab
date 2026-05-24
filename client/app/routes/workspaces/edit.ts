import { service } from '@ember/service';
import type WorkspaceModel from 'client/models/workspace';
import type GithubRepositoryModel from 'client/models/github-repository';
import type ApiService from 'client/services/api';
import ProtectedRoute from 'client/routes/protected';

type StoreLike = {
  findRecord(modelName: 'workspace', id: number): Promise<WorkspaceModel>;
  query(
    modelName: 'github-repository',
    query: Record<string, unknown>
  ): Promise<ArrayLike<GithubRepositoryModel>>;
};

type LastWorkspaceServiceLike = {
  setWorkspaceId(workspaceId: number): void;
};

export type WorkspacesIssuesRouteModel = {
  workspace: WorkspaceModel;
  repositories: GithubRepositoryModel[];
  navigation: WorkspaceNavigation;
};

export type WorkspaceNavigationItem = {
  id: string;
  label: string;
  iconName: string;
  route: string;
  query?: Record<string, unknown>;
};

export type WorkspaceNavigationChannel = {
  id: number;
  name: string;
};

export type WorkspaceNavigation = {
  items: WorkspaceNavigationItem[];
  channels: WorkspaceNavigationChannel[];
  canCreateChannels: boolean;
  canManageGithubInstallation: boolean;
};

export default class WorkspacesEditRoute extends ProtectedRoute {
  @service declare store: StoreLike;
  @service declare lastWorkspace: LastWorkspaceServiceLike;
  @service declare api: ApiService;

  async model(params: { id: string }): Promise<WorkspacesIssuesRouteModel> {
    const workspaceId = Number.parseInt(params.id, 10);

    const canAccessWorkspace = await this.requireWorkspacePermission(
      workspaceId,
      'workspace.view'
    );

    if (!canAccessWorkspace) {
      return {
        workspace: undefined as never,
        repositories: [],
        navigation: {
          items: [],
          channels: [],
          canCreateChannels: false,
          canManageGithubInstallation: false,
        },
      };
    }

    const [workspace, repositories, navigationPayload] = await Promise.all([
      this.store.findRecord('workspace', workspaceId),
      this.store.query('github-repository', {
        filter: {
          where: {
            workspaceId,
          },
          order: ['name ASC'],
        },
      }),
      this.api.request(`/workspaces/${workspaceId}/navigation`),
    ]);

    return {
      workspace,
      repositories: Array.from(repositories),
      navigation: parseWorkspaceNavigation(navigationPayload),
    };
  }

  afterModel(model: WorkspacesIssuesRouteModel): void {
    this.lastWorkspace.setWorkspaceId(Number(model.workspace.id));
  }
}

function parseWorkspaceNavigation(payload: unknown): WorkspaceNavigation {
  if (!isNavigationPayload(payload)) {
    return {
      items: [],
      channels: [],
      canCreateChannels: false,
      canManageGithubInstallation: false,
    };
  }

  return {
    items: payload.items
      .filter((item) => typeof item.route === 'string')
      .map((item) => ({
        id: String(item.id),
        label: String(item.label),
        iconName: String(item.iconName),
        route: String(item.route),
        query: isRecord(item.query) ? item.query : undefined,
      })),
    channels: payload.channels
      .filter(
        (channel) =>
          Number.isFinite(Number(channel.id)) &&
          typeof channel.name === 'string'
      )
      .map((channel) => ({
        id: Number(channel.id),
        name: String(channel.name),
      })),
    canCreateChannels: Boolean(payload.canCreateChannels),
    canManageGithubInstallation: Boolean(payload.canManageGithubInstallation),
  };
}

function isNavigationPayload(payload: unknown): payload is {
  items: Array<Record<string, unknown>>;
  channels: Array<Record<string, unknown>>;
  canCreateChannels?: boolean;
  canManageGithubInstallation?: boolean;
} {
  return (
    isRecord(payload) &&
    Array.isArray(payload.items) &&
    Array.isArray(payload.channels)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
