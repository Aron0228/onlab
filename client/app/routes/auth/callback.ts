import Route from '@ember/routing/route';
import type Transition from '@ember/routing/transition';
import { service } from '@ember/service';
import RouterService from '@ember/routing/router-service';

type AuthCallbackSessionService = {
  authenticate(
    authenticator: string,
    credentials: {
      token: string;
      expiresAt: string;
      userId?: number;
    }
  ): Promise<void>;
};

export default class AuthCallbackRoute extends Route {
  @service declare session: AuthCallbackSessionService;
  @service declare router: RouterService;
  @service declare sessionAccount: {
    hydrate(data?: { authenticated?: { userId?: number } }): Promise<void>;
  };

  async beforeModel(transition: Transition) {
    const { token_id, expires_at, user_id } = transition.to?.queryParams ?? {};
    const userId =
      typeof user_id === 'string' ? Number.parseInt(user_id, 10) : undefined;

    if (token_id && expires_at) {
      const authenticated = {
        token: token_id as string,
        expiresAt: expires_at as string,
        userId: Number.isNaN(userId) ? undefined : userId,
      };

      await this.session.authenticate('authenticator:token', authenticated);
      await this.sessionAccount.hydrate({ authenticated });

      this.router.transitionTo('workspaces');
    } else {
      this.router.transitionTo('auth.login');
    }
  }
}
