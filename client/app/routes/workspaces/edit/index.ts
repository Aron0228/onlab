import Route from '@ember/routing/route';
import { service } from '@ember/service';
import type RouterService from '@ember/routing/router-service';

export default class WorkspacesEditIndexRoute extends Route {
  @service declare router: RouterService;

  beforeModel(): void {
    const workspaceId = this.modelFor('workspaces.edit') as {
      workspace?: { id?: string | number | null } | null;
    };

    this.router.replaceWith(
      'workspaces.edit.news-feed',
      Number(workspaceId.workspace?.id)
    );
  }
}
