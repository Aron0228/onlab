import Component from '@glimmer/component';
import UiContainer from 'client/components/ui/container';
import UiThemeSwitcher from 'client/components/ui/theme-switcher';
import UiIcon from 'client/components/ui/icon';
import { action } from '@ember/object';
import { on } from '@ember/modifier';
import type { EmptyArgs } from 'client/types/component';

export interface RoutesLoginSignature {
  // The arguments accepted by the component
  Args: EmptyArgs;
  // Any blocks yielded by the component
  Blocks: {
    default: [];
  };
  // The element to which `...attributes` is applied in the component template
  Element: null;
}

export default class RoutesLogin extends Component<RoutesLoginSignature> {
  githubAuth = () => {
    const apiUrl =
      (import.meta.env.VITE_API_URL as string | undefined) ??
      'http://localhost:30022';
    const endpoint = `${apiUrl}/auth/github`;

    window.location.assign(endpoint);
  };

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

  @action onClick() {
    this.githubAuth();
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
          <UiContainer>
            <div
              class="layout-vertical --align-items-center --gap-lg --padding-md"
            >
              <h2 class="title">Sign in to continue</h2>
              <button
                class="login-button"
                type="button"
                {{on "click" this.onClick}}
              >
                <UiIcon @name="brand-github" />
                Continue with GitHub
              </button>
              <span class="font-color-text-muted font-size-text-sm">Disclamer:
                work in progress</span>
            </div>
          </UiContainer>
        </div>

        <div class="layout-horizontal --gap-xl">
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
