import Route from '@ember/routing/route';
import type Transition from '@ember/routing/transition';
import {service} from '@ember/service';
import RouterService from '@ember/routing/router-service';

type FlashMessagesServiceLike = {
  success(message: string, options?: {title?: string}): void;
  warning(message: string, options?: {title?: string}): void;
};

type ApiServiceLike = {
  request(path: string, options: {method: 'GET'}): Promise<{
    githubInstallationId?: string | null;
  }>;
};

export default class WorkspacesCallbackRoute extends Route {
  @service declare api: ApiServiceLike;
  @service declare router: RouterService;
  @service declare flashMessages: FlashMessagesServiceLike;

  async beforeModel(transition: Transition) {
    const workspaceIdParam = transition.to?.queryParams?.workspaceId;
    const workspaceId =
      typeof workspaceIdParam === 'string'
        ? Number.parseInt(workspaceIdParam, 10)
        : Number.NaN;

    if (Number.isNaN(workspaceId)) {
      this.flashMessages.warning(
        'We could not determine which workspace to connect to GitHub.',
        {
          title: 'GitHub app connection incomplete',
        }
      );
      this.router.transitionTo('workspaces');
      return;
    }

    try {
      const workspace = await this.api.request(`/workspaces/${workspaceId}`, {
        method: 'GET',
      });

      if (workspace.githubInstallationId) {
        this.flashMessages.success(
          'Your workspace is ready and the GitHub app was installed successfully.',
          {
            title: 'Workspace created',
          }
        );
      } else {
        this.flashMessages.warning(
          'Your workspace was created, but the GitHub app installation was not completed.',
          {
            title: 'GitHub app connection incomplete',
          }
        );
      }
    } catch {
      this.flashMessages.warning(
        'Your workspace was created, but we could not verify the GitHub app installation.',
        {
          title: 'GitHub app connection incomplete',
        }
      );
    }

    this.router.transitionTo('workspaces');
  }
}
