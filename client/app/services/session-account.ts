import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { inject as service } from '@ember/service';
import type UserModel from 'client/models/user';

type SessionData = {
  authenticated?: {
    userId?: number;
  };
};

type StoreLike = {
  findRecord(modelName: 'user', id: number): Promise<UserModel>;
};

export default class SessionAccountService extends Service {
  @service declare store: StoreLike;

  @tracked id?: number;
  @tracked user: UserModel | null = null;

  async hydrate(sessionData?: SessionData): Promise<void> {
    const userId = sessionData?.authenticated?.userId;

    this.id = userId;
    this.user = null;

    if (!userId) {
      return;
    }

    this.user = await this.store.findRecord('user', userId);
  }

  clear(): void {
    this.id = undefined;
    this.user = null;
  }
}
