import Component from '@glimmer/component';
import { action } from '@ember/object';
import { service } from '@ember/service';
import type RouterService from '@ember/routing/router-service';
import UiThemeSwitcher from 'client/components/ui/theme-switcher';
import RouteProfile from 'client/components/route-profile';
import UiLanguageSelector from 'client/components/ui/language-selector';
import UiIconButton from 'client/components/ui/icon-button';
import type { EmptyArgs } from 'client/types/component';

export interface RoutesWorkspacesHeaderActionsSignature {
  Args: EmptyArgs;
  Blocks: {
    default: [];
  };
  Element: HTMLDivElement;
}

export default class RoutesWorkspacesHeaderActions extends Component<RoutesWorkspacesHeaderActionsSignature> {
  @service declare router: RouterService;

  @action
  openNotifications(): void {
    void this.router.transitionTo('notifications');
  }

  <template>
    <div
      class="workspace-header-actions layout-horizontal --gap-md margin-left-auto"
    >
      <UiLanguageSelector />
      <UiThemeSwitcher />
      <UiIconButton
        @iconName="bell"
        @onClick={{this.openNotifications}}
        aria-label="Open notifications"
      />
      <hr class="separator --vertical" />
      <span class="workspace-header-actions__profile">
        <RouteProfile />
      </span>
    </div>
  </template>
}
