import Component from '@glimmer/component';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { eq } from 'ember-truth-helpers';
import type Owner from '@ember/owner';
import UiIcon from 'client/components/ui/icon';

const THEME_KEY = 'theme';

// TODO: patch user preference on the api if the user is authenticated
export default class UiThemeSwitcher extends Component {
  @tracked mode: 'light' | 'dark' = 'dark';

  constructor(owner: Owner, args: object) {
    super(owner, args);
    this.initTheme();
  }

  private initTheme() {
    if (typeof window === 'undefined') return;

    const saved = localStorage.getItem(THEME_KEY);
    const systemDark = window.matchMedia(
      '(prefers-color-scheme: dark)'
    ).matches;

    const initialMode = saved || (systemDark ? 'dark' : 'light');
    this.setMode(initialMode as 'light' | 'dark');

    window
      .matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', (e) => {
        if (!localStorage.getItem(THEME_KEY)) {
          this.setMode(e.matches ? 'dark' : 'light');
        }
      });
  }

  @action toggleTheme() {
    const next = this.mode === 'dark' ? 'light' : 'dark';
    this.setMode(next);
    localStorage.setItem(THEME_KEY, next);
  }

  private setMode(mode: 'light' | 'dark') {
    this.mode = mode;
    document.documentElement.setAttribute('data-theme', mode);
  }

  <template>
    <button
      type="button"
      class="theme-switcher"
      {{on "click" this.toggleTheme}}
      ...attributes
    >
      <div class="theme-switcher__icon-container">
        <UiIcon
          @name={{if (eq this.mode "dark") "moon" "sun"}}
          @variant="primary"
        />
      </div>
    </button>
  </template>
}
