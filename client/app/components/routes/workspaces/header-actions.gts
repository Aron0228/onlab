import Component from '@glimmer/component';
import { action } from '@ember/object';
import { service } from '@ember/service';
import type RouterService from '@ember/routing/router-service';
import type SessionService from 'ember-simple-auth/services/session';
import UiThemeSwitcher from 'client/components/ui/theme-switcher';
import RouteProfile from 'client/components/route-profile';
import UiLanguageSelector from 'client/components/ui/language-selector';
import UiIconButton from 'client/components/ui/icon-button';
import type { EmptyArgs } from 'client/types/component';
import type {
  ApiServiceLike,
  FlashMessagesServiceLike,
  SessionAccountServiceLike,
} from 'client/types/services';

export interface RoutesWorkspacesHeaderActionsSignature {
  Args: EmptyArgs;
  Blocks: {
    default: [];
  };
  Element: HTMLDivElement;
}

export default class RoutesWorkspacesHeaderActions extends Component<RoutesWorkspacesHeaderActionsSignature> {
  @service declare router: RouterService;
  @service declare api: ApiServiceLike;
  @service declare flashMessages: FlashMessagesServiceLike;
  @service declare session: SessionService;
  @service declare sessionAccount: SessionAccountServiceLike;

  @action
  openNotifications(): void {
    void this.router.transitionTo('notifications');
  }

  @action
  async logout(): Promise<void> {
    try {
      await this.api.request('/auth/logout', { method: 'POST' });
      this.sessionAccount.clear?.();
      await this.session.invalidate();
      this.flashMessages.success?.('You have been logged out safely.', {
        title: 'Signed out',
      });
      void this.router.transitionTo('auth.login');
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'We could not sign you out. Please try again.';

      this.flashMessages.danger(message, {
        title: 'Logout failed',
      });
    }
  }

  <template>
    <div class="layout-horizontal --gap-md margin-left-auto">
      <UiLanguageSelector />
      <UiThemeSwitcher />
      <UiIconButton
        @iconName="bell"
        @onClick={{this.openNotifications}}
        aria-label="Open notifications"
      />
      <hr class="separator --vertical" />
      <UiIconButton
        @iconName="logout"
        @onClick={{this.logout}}
        aria-label="Log out"
      />
      <RouteProfile />
    </div>
  </template>
}
