import Route from '@ember/routing/route';
import { service } from '@ember/service';
import type RouterService from '@ember/routing/router-service';
import type ApiService from 'client/services/api';

type PermissionDecision = {
  allowed: boolean;
};

type WorkspaceRouteModel = {
  workspace?: {
    id?: string | number | null;
  } | null;
};

export default class ProtectedRoute extends Route {
  @service declare api: ApiService;
  @service declare router: RouterService;

  async canAccessWorkspaceRoute(
    workspaceId: number,
    permission: string
  ): Promise<boolean> {
    const decision = (await this.api.request('/authorization/check', {
      method: 'POST',
      body: {
        workspaceId,
        permission,
      },
    })) as PermissionDecision;

    return decision.allowed;
  }

  async requireWorkspacePermission(
    workspaceId: number,
    permission: string
  ): Promise<boolean> {
    const allowed = await this.canAccessWorkspaceRoute(workspaceId, permission);

    if (!allowed) {
      if (
        this.routeName.startsWith('workspaces.edit.') &&
        this.routeName !== 'workspaces.edit.access-denied'
      ) {
        this.router.transitionTo('workspaces.edit.access-denied', workspaceId);
      } else {
        this.router.transitionTo('access-denied');
      }
    }

    return allowed;
  }

  workspaceIdFromParentRoute(routeName = 'workspaces.edit'): number {
    const parentModel = this.modelFor(routeName) as WorkspaceRouteModel;
    return Number(parentModel.workspace?.id);
  }
}
