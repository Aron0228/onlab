import Component from '@glimmer/component';
import { inject as service } from '@ember/service';
import { action } from '@ember/object';
import UiDropdown from 'client/components/ui/dropdown';
import { t } from 'ember-intl';
import moment from 'moment';
import type Owner from '@ember/owner';
import type { EmptyArgs } from 'client/types/component';
import { or } from 'ember-truth-helpers';

interface Language {
  code: string;
  tKey: string;
  flag: string;
  momentLocale: 'hu' | 'en';
}

type LanguageOption = {
  code?: string;
  tKey?: string;
  flag?: string;
  momentLocale?: 'hu' | 'en';
};

const LOCALE_KEY = 'locale';

const LANGUAGES: Language[] = [
  {
    code: 'hu-hu',
    tKey: 'ui.language-selector.hungarian',
    flag: 'HU',
    momentLocale: 'hu',
  },
  {
    code: 'en-us',
    tKey: 'ui.language-selector.english',
    flag: 'EN',
    momentLocale: 'en',
  },
] as const;

export default class UiLanguageSelector extends Component {
  @service declare intl: {
    primaryLocale: string;
    setLocale(locale: string): void;
  };

  locale = 'en-us';
  textFadeDurationMs = 250;

  constructor(owner: Owner, args: EmptyArgs) {
    super(owner, args);

    this.locale = this.intl.primaryLocale;
  }

  get currentLocale() {
    return LANGUAGES.find((l) => l.code === this.locale);
  }

  get locales() {
    return LANGUAGES;
  }

  @action onLanguageChange(language: LanguageOption | null): void {
    if (
      !language?.code ||
      !language.tKey ||
      !language.flag ||
      !language.momentLocale
    ) {
      return;
    }

    void this.selectLocale(language as Language);
  }

  @action async selectLocale(language: Language) {
    if (this.locale === language.code) {
      return;
    }

    this.locale = language.code;

    const app =
      document.querySelector<HTMLElement>('#app-root') ??
      document.querySelector<HTMLElement>('.ember-application') ??
      document.body;

    app?.classList.remove('lang-fade-in');
    app?.classList.add('lang-hidden');

    await new Promise((resolve) => setTimeout(resolve, 40));

    this.intl.setLocale(language.code);
    moment.locale(language.momentLocale);
    localStorage.setItem(LOCALE_KEY, language.code);

    requestAnimationFrame(() => {
      app?.classList.add('lang-fade-in');
      app?.classList.remove('lang-hidden');

      window.setTimeout(() => {
        app?.classList.remove('lang-fade-in');
      }, this.textFadeDurationMs);
    });
  }

  <template>
    <div class="ui-language-selector__container">
      <UiDropdown
        @options={{this.locales}}
        @selected={{this.currentLocale}}
        @onChange={{this.onLanguageChange}}
        class="ui-language-selector"
      >
        <:selected as |option|>
          <span
            class="font-weight-bold color-primary-500"
          >{{option.flag}}</span>
        </:selected>
        <:option as |option|>
          <span class="ui-language-selector__option-label">
            <span class="font-weight-bold">{{option.flag}}</span>
            <hr class="ui-language-selector__option-separator" />
            <span>{{t (or option.tKey "")}}</span>
          </span>
        </:option>
      </UiDropdown>
    </div>
  </template>
}
