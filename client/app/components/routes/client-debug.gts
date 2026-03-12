import Component from '@glimmer/component';
import { service } from '@ember/service';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';
import type UserModel from 'client/models/user';
import { or } from 'ember-truth-helpers';
import { on } from '@ember/modifier';
import UiFileUpload from 'client/components/ui/file-upload';
import { array } from '@ember/helper';

type SessionServiceLike = {
  isAuthenticated: boolean;
  data: {
    authenticated: {
      token?: string;
      expiresAt?: string;
    };
  };
  invalidate(): Promise<void>;
};

type StoreLike = {
  findAll(modelName: string): Promise<ArrayLike<UserModel>>;
};

export default class RoutesClientDebug extends Component {
  @service declare session: SessionServiceLike;
  @service declare store: StoreLike;

  @tracked users: UserModel[] = [];
  @tracked lastResult: string | null = null;
  @tracked errorMessage: string | null = null;
  @tracked isLoadingUsers = false;
  @tracked isInvalidating = false;

  get tokenPreview(): string {
    const token = this.session.data.authenticated.token;

    if (!token) {
      return 'No token in session';
    }

    if (token.length <= 24) {
      return token;
    }

    return `${token.slice(0, 12)}...${token.slice(-12)}`;
  }

  @action async loadUsers(): Promise<void> {
    this.isLoadingUsers = true;
    this.errorMessage = null;

    try {
      const users = await this.store.findAll('user');
      this.users = Array.from(users);
      this.lastResult = `Loaded ${this.users.length} users through the store`;
    } catch (error: unknown) {
      this.users = [];
      this.errorMessage =
        error instanceof Error ? error.message : 'Failed to load users';
      this.lastResult = null;
    } finally {
      this.isLoadingUsers = false;
    }
  }

  @action async invalidateSession(): Promise<void> {
    this.isInvalidating = true;
    this.errorMessage = null;

    try {
      await this.session.invalidate();
      this.users = [];
      this.lastResult = 'Session invalidated';
    } catch (error: unknown) {
      this.errorMessage =
        error instanceof Error ? error.message : 'Failed to invalidate session';
    } finally {
      this.isInvalidating = false;
    }
  }

  <template>
    <section class="layout-vertical --gap-md --padding-md">
      <h1>Client Debug</h1>
      <p>Use this route to verify session restoration and authenticated store
        requests.</p>

      <div class="layout-vertical --gap-xs">
        <p><strong>Authenticated:</strong>
          {{if this.session.isAuthenticated "yes" "no"}}</p>
        <p><strong>Expires at:</strong>
          {{or this.session.data.authenticated.expiresAt "n/a"}}</p>
        <p><strong>Token preview:</strong> {{this.tokenPreview}}</p>
      </div>

      <div class="layout-horizontal --gap-sm">
        <button
          type="button"
          disabled={{this.isLoadingUsers}}
          {{on "click" this.loadUsers}}
        >
          {{if this.isLoadingUsers "Loading..." "Load users via store"}}
        </button>

        <button
          type="button"
          disabled={{this.isInvalidating}}
          {{on "click" this.invalidateSession}}
        >
          {{if this.isInvalidating "Invalidating..." "Invalidate session"}}
        </button>
      </div>

      {{#if this.lastResult}}
        <p>{{this.lastResult}}</p>
      {{/if}}

      {{#if this.errorMessage}}
        <p>{{this.errorMessage}}</p>
      {{/if}}

      <div class="layout-vertical --gap-xs">
        <h2>Users</h2>

        {{#if this.users.length}}
          <ul>
            {{#each this.users as |user|}}
              <li>#{{user.id}} {{user.username}} ({{user.email}})</li>
            {{/each}}
          </ul>
        {{else}}
          <p>No users loaded yet.</p>
        {{/if}}
      </div>

      <UiFileUpload @extensions={{array ".pdf" ".md" ".txt"}} />
    </section>
  </template>
}
