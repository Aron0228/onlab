import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';
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

export default class ApplicationRoute extends Route {
  @service
  intl!: IntlService;

  async beforeModel() {
    await this.loadTranslations();
    const saved = this.getSavedLocale();

    this.setupIntlAndMoment(saved);
    console.log('setup complete');
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
}
