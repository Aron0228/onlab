import Component from '@glimmer/component';
import UiAvatar from 'client/components/ui/avatar';
import UiIcon from 'client/components/ui/icon';
import { action } from '@ember/object';
import { registerDestructor } from '@ember/destroyable';
import { service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { or } from 'ember-truth-helpers';
import type Owner from '@ember/owner';
import type RouterService from '@ember/routing/router-service';
import type SessionService from 'ember-simple-auth/services/session';
import type UserModel from 'client/models/user';
import type {
  ApiServiceLike,
  FlashMessagesServiceLike,
} from 'client/types/services';

export interface RouteProfileSignature {
  // The arguments accepted by the component
  Args: {
    routeBack?: string;
  };
  // Any blocks yielded by the component
  Blocks: {
    default: [];
  };
  // The element to which `...attributes` is applied in the component template
  Element: null;
}

type SessionAccountServiceLike = {
  user: UserModel | null;
  clear?(): void;
};

export default class RouteProfile extends Component<RouteProfileSignature> {
  @service declare api: ApiServiceLike;
  @service declare flashMessages: FlashMessagesServiceLike;
  @service declare sessionAccount: SessionAccountServiceLike;
  @service declare router: RouterService;
  @service declare session: SessionService;

  @tracked isOpen = false;

  constructor(owner: Owner, args: RouteProfileSignature['Args']) {
    super(owner, args);

    document.addEventListener('click', this.closeOnOutsideClick);
    registerDestructor(this, () => {
      document.removeEventListener('click', this.closeOnOutsideClick);
    });
  }

  get user() {
    return this.sessionAccount.user;
  }

  get routeBack() {
    return this.args.routeBack ?? 'workspaces.index';
  }

  get routeBackUrl() {
    return this.router.currentURL ?? null;
  }

  get usernameTag() {
    return this.user ? `@${this.user.username}` : '';
  }

  private closeOnOutsideClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null;

    if (!target?.closest('.route-profile-dropdown')) {
      this.isOpen = false;
    }
  };

  @action toggleMenu(event: Event): void {
    event.stopPropagation();
    this.isOpen = !this.isOpen;
  }

  @action openProfile(event: Event): void {
    event.stopPropagation();
    this.isOpen = false;
    void this.router.transitionTo('profile', {
      queryParams: {
        routeBack: this.routeBack,
        routeBackUrl: this.routeBackUrl,
      },
    });
  }

  @action async logout(event: Event): Promise<void> {
    event.stopPropagation();
    this.isOpen = false;

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
    {{#if this.user}}
      <div class="route-profile-dropdown">
        <button
          type="button"
          class="route-profile-component"
          aria-haspopup="menu"
          aria-expanded={{if this.isOpen "true" "false"}}
          {{on "click" this.toggleMenu}}
        >
          <div class="route-profile-component__meta">
            <span class="route-profile-component__title margin-zero">
              {{or this.user.fullName this.user.username}}
            </span>
            <span class="route-profile-component__subtitle">
              {{this.usernameTag}}
            </span>
          </div>

          <UiAvatar @model={{this.user}} @size="sm" />
        </button>

        {{#if this.isOpen}}
          <div class="route-profile-menu" role="menu">
            <button
              type="button"
              class="route-profile-menu__item"
              role="menuitem"
              {{on "click" this.openProfile}}
            >
              <UiIcon @name="user" @size="sm" />
              <span>Go to profile</span>
            </button>
            <button
              type="button"
              class="route-profile-menu__item --danger"
              role="menuitem"
              {{on "click" this.logout}}
            >
              <UiIcon @name="logout" @size="sm" />
              <span>Log out</span>
            </button>
          </div>
        {{/if}}
      </div>
    {{/if}}
  </template>
}
