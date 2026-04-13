import Component from '@glimmer/component';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import UiIcon from 'client/components/ui/icon';
import UiThemeSwitcher from 'client/components/ui/theme-switcher';
import UiLanguageSelector from 'client/components/ui/language-selector';
import UiIconButton from 'client/components/ui/icon-button';
import UiContainer from 'client/components/ui/container';
import UiAvatar from 'client/components/ui/avatar';
import UiButton from 'client/components/ui/button';
import UiFooterActions from 'client/components/ui/footer-actions';
import UiLoadingSpinner from 'client/components/ui/loading-spinner';
import { task } from 'ember-concurrency';
import { or } from 'ember-truth-helpers';
import UiFormGroup from 'client/components/ui/form-group';
import UiInput from 'client/components/ui/input';
import type {
  ApiServiceLike,
  AuthenticatedSessionLike,
  FlashMessagesServiceLike,
  RouterServiceLike,
  SessionAccountServiceLike,
} from 'client/types/services';

type StoreLike = {
  saveRecord<T>(record: T): Promise<T>;
};

export interface RoutesProfileSignature {
  // The arguments accepted by the component
  Args: {
    routeBack: string;
    routeBackUrl: string | null;
  };
  // Any blocks yielded by the component
  Blocks: {
    default: [];
  };
  // The element to which `...attributes` is applied in the component template
  Element: null;
}

export default class RoutesProfile extends Component<RoutesProfileSignature> {
  @service declare api: ApiServiceLike;
  @service declare flashMessages: FlashMessagesServiceLike;
  @service declare router: RouterServiceLike;
  @service declare session: AuthenticatedSessionLike;
  @service declare sessionAccount: SessionAccountServiceLike;
  @service declare store: StoreLike;

  @tracked selectedAvatarFile: File | null = null;

  get hasChanges(): boolean {
    return Boolean(this.selectedAvatarFile);
  }

  saveChangesTask = task(async () => {
    const user = this.sessionAccount.user;

    if (!user || !this.selectedAvatarFile) {
      return;
    }

    const uploadedFile = await this.uploadAvatar(this.selectedAvatarFile);
    const apiHost =
      (import.meta.env.VITE_API_URL as string) ?? 'http://localhost:30022';
    const previewUrl = new URL(`${apiHost}/files/${uploadedFile.id}/preview`);
    const previousAvatarUrl = user.avatarUrl;

    user.avatarUrl = previewUrl.toString();

    try {
      await this.store.saveRecord(user);
    } catch (error) {
      user.avatarUrl = previousAvatarUrl;
      throw error;
    }

    this.selectedAvatarFile = null;

    this.flashMessages.success?.('Your profile picture has been updated.', {
      title: 'Success',
    });
  });

  async uploadAvatar(file: File): Promise<{ id: number }> {
    const token = this.session.data.authenticated?.token;
    const params: Record<string, string> = {
      originalName: file.name,
    };

    if (token) {
      params.token = token;
    }

    const formData = new FormData();
    formData.append('originalName', file.name);
    formData.append('file', file);

    return await this.api.request<{ id: number }>('/files/upload', {
      method: 'POST',
      body: formData,
      params,
    });
  }

  deleteProfileTask = task(async () => {
    await this.api.request('/users/deleteProfile', {
      method: 'POST',
    });

    this.sessionAccount.clear?.();
    await this.session.invalidate();
    this.router.transitionTo('auth.login');
  });

  @action onAvatarChanged(file: File): void {
    this.selectedAvatarFile = file;
  }

  @action
  onSubmit(event?: Event): void {
    event?.preventDefault();

    this.saveChangesTask.perform().catch((error: unknown) => {
      this.flashMessages.danger(
        error instanceof Error
          ? error.message
          : 'Failed to update profile picture.',
        {
          title: 'An error occured',
        }
      );
    });
  }

  @action
  onDeleteProfile(): void {
    this.deleteProfileTask.perform().catch((error: unknown) => {
      this.flashMessages.danger(
        error instanceof Error ? error.message : 'Failed to delete profile.',
        {
          title: 'An error occured',
        }
      );
    });
  }

  @action
  onBackClick(): void {
    if (
      typeof window !== 'undefined' &&
      this.args.routeBackUrl &&
      window.history.length > 1
    ) {
      window.history.back();
      return;
    }

    this.router.transitionTo(this.args.routeBack);
  }

  <template>
    {{#if (or this.saveChangesTask.isRunning this.deleteProfileTask.isRunning)}}
      <UiLoadingSpinner @backdrop={{true}} />
    {{/if}}
    <div class="layout-vertical --max-height --overflow-y-auto route-profile">
      <div class="header">
        <div class="layout-horizontal --gap-md">
          <UiIconButton
            @iconName="arrow-narrow-left"
            @onClick={{this.onBackClick}}
            @iconSize="md"
          />
          <div class="layout-vertical --gap-sm">
            <div class="layout-horizontal --gap-sm">
              <UiIcon @name="user" @variant="primary" />
              <h2 class="margin-zero">My Profile</h2>
            </div>

            <span class="font-color-text-secondary font-size-text-sm">Manage
              your personal information and preferences</span>
          </div>
        </div>

        <div class="layout-horizontal --gap-md maring-left-auto">
          <UiLanguageSelector />
          <UiThemeSwitcher />
        </div>
      </div>

      <div class="body layout-vertical --gap-xl">
        <UiContainer @title="Profile Picture" @bordered={{true}}>
          <div class="layout-vertical --gap-xl">
            <div class="layout-horizontal --gap-lg">
              <UiAvatar
                @model={{this.sessionAccount.user}}
                @squared={{true}}
                @onChange={{this.onAvatarChanged}}
              />

              <UiContainer
                @bordered={{true}}
                @variant="primary"
                class="tip-container"
              >
                <:header>
                  <div class="layout-horizontal --gap-sm">
                    <UiIcon @name="upload" @variant="primary" @size="sm" />
                    <span
                      class="margin-zero font-weight-medium font-size-text-sm"
                    >Tips for best results:</span>
                  </div>
                </:header>
                <:default>
                  <ul>
                    <li class="font-color-text-secondary font-size-text-sm">Use
                      a square image for best fit</li>
                    <li
                      class="font-color-text-secondary font-size-text-sm"
                    >Recommended size: at least 400x400px</li>
                    <li
                      class="font-color-text-secondary font-size-text-sm"
                    >Supported formats: JPG, PNG, GIF, WebP</li>
                  </ul>
                </:default>
              </UiContainer>
            </div>

            <div class="layout-horizontal --gap-sm">
              <UiIcon @name="info-circle" @variant="info" />
              <span><strong>Note: </strong>Profile pictures do not change on
                GitHub</span>
            </div>
          </div>
        </UiContainer>

        <UiContainer @bordered={{true}} @title="Personal Information">
          <div class="layout-vertical --gap-md">
            <div class="profile-github-connection">
              <div class="profile-github-connection__icon">
                <UiIcon @name="brand-github" @size="md" @variant="info" />
              </div>

              <div class="profile-github-connection__meta">
                <h3 class="profile-github-connection__title margin-zero">
                  Connected via GitHub
                </h3>
                <span class="profile-github-connection__username">
                  @{{this.sessionAccount.user.username}}
                </span>
              </div>

              <UiIcon
                @name="check"
                @variant="primary"
                class="margin-left-auto"
              />
            </div>

            <UiFormGroup @label="Full Name">
              <UiInput
                @value={{or this.sessionAccount.user.fullName}}
                @disabled={{true}}
              />
            </UiFormGroup>

            <UiFormGroup @label="Email Address">
              <UiInput
                @value={{this.sessionAccount.user.email}}
                @disabled={{true}}
              />
            </UiFormGroup>

            <div class="layout-horizontal --gap-sm">
              <UiIcon @name="info-circle" @variant="info" />
              <span><strong>Note: </strong>These informations are synced from
                GitHub, therefore they can't be changed</span>
            </div>
          </div>
        </UiContainer>

        <UiContainer
          @bordered={{true}}
          @title="Danger Zone"
          @variant="error"
          class="danger-zone-container"
        >
          <div class="layout-vertical --gap-md">
            <span>
              Once you delete your profile, there is no going back. All your
              data, workspaces, and settings will be permanently deleted.
            </span>

            <UiButton
              @hierarchy="secondary"
              @iconLeft="trash"
              @text="Delete Profile"
              @onClick={{this.onDeleteProfile}}
              @loading={{this.deleteProfileTask.isRunning}}
              class="danger-zone-container__delete-button"
            />

          </div>
        </UiContainer>
      </div>

      {{#if this.hasChanges}}
        <UiFooterActions class="profile-footer">
          <UiButton
            @text="Save changes"
            @hierarchy="primary"
            @onClick={{this.onSubmit}}
            @loading={{this.saveChangesTask.isRunning}}
          />
        </UiFooterActions>
      {{/if}}
    </div>
  </template>
}
