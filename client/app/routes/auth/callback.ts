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
    }
  ): Promise<void>;
};

export default class AuthCallbackRoute extends Route {
  @service declare session: AuthCallbackSessionService;
  @service declare router: RouterService;

  async beforeModel(transition: Transition) {
    const { token_id, expires_at } = transition.to?.queryParams ?? {};

    if (token_id && expires_at) {
      await this.session.authenticate('authenticator:token', {
        token: token_id as string,
        expiresAt: expires_at as string,
      });

      this.router.transitionTo('index');
    } else {
      this.router.transitionTo('login');
    }
  }
}
