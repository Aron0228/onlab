import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';
import IntlService from 'ember-intl/services/intl';

const translationModules = {
  'hu-hu': () => import('../../translations/hu-hu.json'),
  'en-us': () => import('../../translations/en-us.json'),
} as const;

export default class ApplicationRoute extends Route {
  @service
  intl!: IntlService;

  async beforeModel() {
    await this.setupIntl();
    const saved = localStorage.getItem('locale') ?? 'hu-hu';
    this.intl.setLocale(saved);
  }

  private async loadTranslations(locale: 'hu-hu' | 'en-us'): Promise<void> {
    const { default: translations } = await translationModules[locale]();

    this.intl.addTranslations(locale, translations);
  }

  private async setupIntl(): Promise<void> {
    await Promise.allSettled([
      this.loadTranslations('hu-hu'),
      this.loadTranslations('en-us'),
    ]);

    this.intl.setLocale(['en-us']);
  }
}
