import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';

type SessionData = {
  authenticated?: {
    userId?: number;
  };
};

export default class SessionAccountService extends Service {
  @tracked id?: number;

  hydrate(sessionData?: SessionData): void {
    this.id = sessionData?.authenticated?.userId;
  }

  clear(): void {
    this.id = undefined;
  }
}
