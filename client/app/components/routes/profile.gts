import Component from '@glimmer/component';
import { inject as service } from '@ember/service';
import UiIcon from 'client/components/ui/icon';
import UiThemeSwitcher from 'client/components/ui/theme-switcher';
import UiLanguageSelector from 'client/components/ui/language-selector';
import UiIconButton from 'client/components/ui/icon-button';

export interface RoutesProfileSignature {
  // The arguments accepted by the component
  Args: {};
  // Any blocks yielded by the component
  Blocks: {
    default: [];
  };
  // The element to which `...attributes` is applied in the component template
  Element: null;
}

export default class RoutesProfile extends Component<RoutesProfileSignature> {
  @service sessionAccount;

  <template>
    <div class="layout-vertical --max-height --overflow-y-auto route-profile">
      <div class="header">
        <div class="layout-horizontal --gap-md">
          <UiIconButton
            @iconName="arrow-narrow-left"
            @route="workspaces.index"
            @iconSize="md"
          />
          <div class="layout-vertical --gap-sm">
            <div class="layout-horizontal --gap-sm">
              <UiIcon @name="user" @variant="primary" />
              <h2 class="margin-zero">My Profile</h2>
            </div>

            <span class="font-color-text-secondary font-size-text-sm">Manage
              your personal information and preferences</span>
          </div>
        </div>

        <div class="layout-horizontal --gap-md maring-left-auto">
          <UiLanguageSelector />
          <UiThemeSwitcher />
        </div>
      </div>

      <div class="body">
        TODO
      </div>
    </div>
  </template>
}
