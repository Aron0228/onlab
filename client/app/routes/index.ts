import Route from '@ember/routing/route';
import { service } from '@ember/service';
import type RouterService from '@ember/routing/router-service';
import type WorkspaceModel from 'client/models/workspace';

type LastWorkspaceServiceLike = {
  workspaceId: number | null;
  clear(): void;
};

type StoreLike = {
  findRecord(modelName: 'workspace', id: number): Promise<WorkspaceModel>;
};

export default class IndexRoute extends Route {
  @service declare lastWorkspace: LastWorkspaceServiceLike;
  @service declare router: RouterService;
  @service declare store: StoreLike;

  async beforeModel(): Promise<void> {
    const workspaceId = this.lastWorkspace.workspaceId;

    if (!workspaceId) {
      this.router.replaceWith('workspaces.index');
      return;
    }

    try {
      await this.store.findRecord('workspace', workspaceId);
      this.router.replaceWith('workspaces.edit.news-feed', workspaceId);
    } catch {
      this.lastWorkspace.clear();
      this.router.replaceWith('workspaces.index');
    }
  }
}
