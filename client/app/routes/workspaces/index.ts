import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';
import RouterService from '@ember/routing/router-service';
import type WorkspaceModel from 'client/models/workspace';

type LastWorkspaceServiceLike = {
  workspaceId: number | null;
  clear(): void;
};

type StoreLike = {
  findRecord(modelName: 'workspace', id: number): Promise<WorkspaceModel>;
};

export default class WorkspacesIndexRoute extends Route {
  @service declare lastWorkspace: LastWorkspaceServiceLike;
  @service declare router: RouterService;
  @service declare store: StoreLike;

  async beforeModel(): Promise<void> {
    const workspaceId = this.lastWorkspace.workspaceId;

    if (!workspaceId) {
      return;
    }

    try {
      // eslint-disable-next-line warp-drive/no-legacy-request-patterns
      await this.store.findRecord('workspace', workspaceId);
      this.router.transitionTo('workspaces.edit', workspaceId);
    } catch {
      this.lastWorkspace.clear();
    }
  }
}
