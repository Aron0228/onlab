import Service from '@ember/service';
import { inject as service } from '@ember/service';

type SessionAccountServiceLike = {
  id?: number;
};

const LAST_WORKSPACE_KEY = 'last-workspace';

export default class LastWorkspaceService extends Service {
  @service declare sessionAccount: SessionAccountServiceLike;

  private get storageKey(): string | null {
    const userId = this.sessionAccount.id;

    if (!userId) {
      return null;
    }

    return `${LAST_WORKSPACE_KEY}:${userId}`;
  }

  get workspaceId(): number | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    const storageKey = this.storageKey;

    if (!storageKey) {
      return null;
    }

    const savedWorkspaceId = localStorage.getItem(storageKey);

    if (!savedWorkspaceId) {
      return null;
    }

    const workspaceId = Number.parseInt(savedWorkspaceId, 10);

    return Number.isNaN(workspaceId) ? null : workspaceId;
  }

  setWorkspaceId(workspaceId: number): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    const storageKey = this.storageKey;

    if (!storageKey) {
      return;
    }

    localStorage.setItem(storageKey, String(workspaceId));
  }

  clear(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    const storageKey = this.storageKey;

    if (!storageKey) {
      return;
    }

    localStorage.removeItem(storageKey);
  }
}
