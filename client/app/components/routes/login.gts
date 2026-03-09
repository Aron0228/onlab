import Component from '@glimmer/component';
import UiContainer from 'client/components/ui/container';
import UiThemeSwitcher from 'client/components/ui/theme-switcher';
import UiIcon from 'client/components/ui/icon';
import svgJar from 'ember-svg-jar/helpers/svg-jar';
import UiButton from 'client/components/ui/button';

export interface RoutesLoginSignature {
  // The arguments accepted by the component
  Args: {};
  // Any blocks yielded by the component
  Blocks: {
    default: [];
  };
  // The element to which `...attributes` is applied in the component template
  Element: null;
}

export default class RoutesLogin extends Component {
  get footerCards() {
    return [
      {
        iconName: 'message-circle',
        text: 'Team Channels',
      },
      {
        iconName: 'git-branch',
        text: 'GitHub Sync',
      },
      {
        iconName: 'sparkles',
        text: 'AI Powered',
      },
    ];
  }

  <template>
    <div class="layout-vertical --max-height route-login --padding-md">
      <div class="layout-horizontal --gap-xs margin-left-auto">
        <UiThemeSwitcher />
      </div>

      <div
        class="layout-vertical --gap-xl --justify-center --align-items-center content-wrapper"
      >
        <div class="layout-vertical --justify-center --align-items-center">
          <UiIcon @name="app-logo" @size="xl" @custom={{true}} />
          <h1>Welcome to DevTeams</h1>
          <span>AI-powered collaboration for development teams</span>
        </div>

        <div class="content-body">
          <UiContainer
            class="layout-vertical --align-items-center --gap-lg --padding-md"
          >
            <h2 class="title">Sign in to continue</h2>
            <button class="login-button" type="submit">
              <UiIcon @name="brand-github" />
              Continue with GitHub
            </button>
            <span class="font-color-text-muted font-size-text-sm">By signing in,
              you agree to our Terms of Service and Privacy Policy</span>
          </UiContainer>
        </div>

        <div class="layout-horizontal --gap-md">
          {{#each this.footerCards as |footerCard|}}
            <div class="layout-horizontal --gap-xs">
              <UiIcon @name={{footerCard.iconName}} @variant="primary" />
              <span>{{footerCard.text}}</span>
            </div>
          {{/each}}
        </div>
      </div>
    </div>
  </template>
}
