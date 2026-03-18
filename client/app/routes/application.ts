import Route from '@ember/routing/route';
import type Transition from '@ember/routing/transition';
import { inject as service } from '@ember/service';
import RouterService from '@ember/routing/router-service';
import IntlService from 'ember-intl/services/intl';
import moment from 'moment';
import 'moment/dist/locale/hu';

const translationModules = {
  'hu-hu': () => import('../../translations/hu-hu.json'),
  'en-us': () => import('../../translations/en-us.json'),
} as const;
type SupportedLocale = keyof typeof translationModules;

// Should have the value of Locale.code
const LOCALE_KEY = 'locale';

interface Locale {
  code: 'hu-hu' | 'en-us';
  momentLocale: 'hu' | 'en';
}
const LOCALES: Locale[] = [
  { code: 'en-us', momentLocale: 'en' },
  { code: 'hu-hu', momentLocale: 'hu' },
] as const;

type ApplicationSessionService = {
  setup(): Promise<void>;
  isAuthenticated: boolean;
  data: {
    authenticated?: {
      userId?: number;
    };
  };
};

export default class ApplicationRoute extends Route {
  @service
  intl!: IntlService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  @service flashMessages!: any;

  @service declare router: RouterService;
  @service declare session: ApplicationSessionService;
  @service declare sessionAccount: {
    hydrate(data?: ApplicationSessionService['data']): Promise<void>;
    clear(): void;
  };

  async beforeModel(transition: Transition) {
    await this.session.setup();
    await this.syncSessionAccount();
    await this.loadTranslations();
    const saved = this.getSavedLocale();

    this.setupIntlAndMoment(saved);

    const routeName = transition.to?.name ?? '';
    const isPublicRoute =
      routeName === 'auth' ||
      routeName.startsWith('auth.') ||
      routeName === 'not-found';

    if (!isPublicRoute && !this.session.isAuthenticated) {
      this.router.transitionTo('auth.login');
    }
  }

  private getSavedLocale(): Locale {
    const saved = localStorage.getItem(LOCALE_KEY);

    const savedLocale = LOCALES.find((l) => l.code === saved);

    // We default to en-us
    return savedLocale ?? LOCALES[0]!;
  }

  private async loadTranslation(locale: SupportedLocale): Promise<void> {
    const { default: translations } = await translationModules[locale]();

    this.intl.addTranslations(locale, translations);
  }

  private async loadTranslations(): Promise<void> {
    await Promise.allSettled([
      this.loadTranslation('hu-hu'),
      this.loadTranslation('en-us'),
    ]);
  }

  private setupIntlAndMoment(locale: Locale) {
    this.intl.setLocale([locale.code]);
    moment.locale(locale.momentLocale);
  }

  private async syncSessionAccount(): Promise<void> {
    if (!this.session.isAuthenticated) {
      this.sessionAccount.clear();
      return;
    }

    await this.sessionAccount.hydrate(this.session.data);
  }
}
