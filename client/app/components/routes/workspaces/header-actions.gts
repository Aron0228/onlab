import Component from '@glimmer/component';
import UiThemeSwitcher from 'client/components/ui/theme-switcher';
import RouteProfile from 'client/components/route-profile';
import UiLanguageSelector from 'client/components/ui/language-selector';

export interface RoutesWorkspacesHeaderActionsSignature {
  Args: {};
  Blocks: {
    default: [];
  };
  Element: HTMLDivElement;
}

export default class RoutesWorkspacesHeaderActions extends Component<RoutesWorkspacesHeaderActionsSignature> {
  <template>
    <div class="layout-horizontal --gap-md margin-left-auto">
      <UiLanguageSelector />
      <UiThemeSwitcher />
      <hr class="separator --vertical" />
      <RouteProfile />
    </div>
  </template>
}
