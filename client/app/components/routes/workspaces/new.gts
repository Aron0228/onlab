import Component from '@glimmer/component';
import type WorkspaceModel from 'client/models/workspace';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';
import UiButton from 'client/components/ui/button';
import { task } from 'ember-concurrency';
import { inject as service } from '@ember/service';
import UiForm from 'client/components/ui/form';
import UiFormGroup from 'client/components/ui/form-group';
import UiInput from 'client/components/ui/input';
import UiIcon from 'client/components/ui/icon';
import UiContainer from 'client/components/ui/container';
import UiAvatar from 'client/components/ui/avatar';
import UiFooterActions from 'client/components/ui/footer-actions';
import UiLoadingSpinner from 'client/components/ui/loading-spinner';
import { LinkTo } from '@ember/routing';
import { not } from 'ember-truth-helpers';
import RoutesWorkspacesHeaderActions from 'client/components/routes/workspaces/header-actions';

export interface RoutesWorkspacesNewSignature {
  // The arguments accepted by the component
  Args: {
    model: WorkspaceModel;
    embedded?: boolean;
  };
  // Any blocks yielded by the component
  Blocks: {
    default: [];
  };
  // The element to which `...attributes` is applied in the component template
  Element: null;
}

type SavedFileResponse = {
  id: number;
};

type StoreLike = {
  saveRecord(record: WorkspaceModel): Promise<WorkspaceModel>;
};

type ApiServiceLike = {
  buildUrl(path: string, params?: Record<string, string>): URL;
  request(
    path: string,
    options: {
      method: string;
      body?: FormData;
      params?: Record<string, string>;
    }
  ): Promise<SavedFileResponse>;
};

type SessionServiceLike = {
  data: {
    authenticated?: {
      token?: string;
    };
  };
};

type FlashMessagesServiceLike = {
  danger(message: string, options?: { title?: string }): void;
  success(message: string, options?: { title?: string }): void;
};

export default class RoutesWorkspacesNew extends Component<RoutesWorkspacesNewSignature> {
  @service declare store: StoreLike;
  @service declare api: ApiServiceLike;
  @service declare session: SessionServiceLike;
  @service declare flashMessages: FlashMessagesServiceLike;

  @tracked selectedAvatarFile: File | null = null;
  @tracked workspaceNameDraft = this.args.model.name ?? '';

  get hasChanges(): boolean {
    return (
      this.workspaceNameDraft !== (this.args.model.name ?? '') ||
      Boolean(this.selectedAvatarFile)
    );
  }

  saveRecordTask = task(async () => {
    const isExistingRecord = this.isExistingRecord;
    const previousName = this.args.model.name;

    this.args.model.name = this.workspaceNameDraft;

    let workspace: WorkspaceModel;

    try {
      workspace = await this.store.saveRecord(this.args.model);
    } catch (error) {
      this.args.model.name = previousName;
      throw error;
    }

    if (!workspace.id) {
      throw new Error('Workspace was created without an identifier.');
    }

    if (this.selectedAvatarFile) {
      const fileRecord = await this.uploadAvatar(
        Number(workspace.id),
        this.selectedAvatarFile
      );

      const previewUrl = this.api.buildUrl(`/files/${fileRecord.id}/preview`);

      workspace.avatarUrl = previewUrl.toString();

      await this.store.saveRecord(workspace);
    }

    this.workspaceNameDraft = workspace.name;
    this.selectedAvatarFile = null;

    if (isExistingRecord) {
      this.flashMessages.success('Workspace settings saved successfully.', {
        title: 'Workspace updated',
      });
      return;
    }

    this.redirectToGithubAppInstallation(Number(workspace.id));
  });

  async uploadAvatar(workspaceId: number, file: File) {
    const token = this.session.data.authenticated?.token;
    const params = {
      workspaceId: String(workspaceId),
      originalName: file.name,
      ...(token ? { token } : {}),
    };

    const formData = new FormData();
    formData.append('workspaceId', String(workspaceId));
    formData.append('originalName', file.name);
    formData.append('file', file);

    const response = await this.api.request('/files/upload', {
      method: 'POST',
      body: formData,
      params,
    });

    return response;
  }

  @action onAvatarChanged(file: File) {
    this.selectedAvatarFile = file;
  }

  redirectToGithubAppInstallation(workspaceId: number) {
    const installUrl = this.api.buildUrl('/github/installApp', {
      workspaceId: String(workspaceId),
    });
    globalThis.location.assign(installUrl.toString());
  }

  get isExistingRecord(): boolean {
    return this.args.model.id != null;
  }

  get isEmbedded(): boolean {
    return this.args.embedded ?? false;
  }

  get heading(): string {
    return this.isExistingRecord
      ? 'Workspace Settings'
      : 'Create New Workspace';
  }

  get submitText(): string {
    return this.isExistingRecord
      ? 'Save Workspace'
      : 'Create Workspace & Install GitHub App';
  }

  get shouldShowInlineSubmitButton(): boolean {
    return !this.isExistingRecord;
  }

  get shouldShowEmbeddedFooterActions(): boolean {
    return this.isEmbedded && this.isExistingRecord && this.hasChanges;
  }

  get errorMessageTitle(): string {
    return this.isExistingRecord ? 'Update failed' : 'An error occured';
  }

  get errorMessage(): string {
    return this.isExistingRecord
      ? 'Workspace update failed. Please try again.'
      : 'Workspace creation failed. Please try again.';
  }

  @action
  updateWorkspaceName(value: string): void {
    this.workspaceNameDraft = value;
  }

  @action
  onSubmit(event?: Event) {
    event?.preventDefault();

    this.saveRecordTask.perform().catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : this.errorMessage;

      this.flashMessages.danger(message, {
        title: this.errorMessageTitle,
      });
    });
  }

  <template>
    {{#if this.saveRecordTask.isRunning}}
      <UiLoadingSpinner @backdrop={{true}} />
    {{/if}}
    {{#if this.isEmbedded}}
      <div class="layout-vertical --gap-md">
        <UiForm id="workspaceForm" @onSubmit={{this.onSubmit}}>
          <UiAvatar
            @model={{@model}}
            @onChange={{this.onAvatarChanged}}
            @squared={{true}}
          />

          <UiFormGroup
            @label="Workspace Name"
            @required={{true}}
            @trailingText="Choose a name that represents your team or organization"
          >
            <UiInput
              @value={{this.workspaceNameDraft}}
              @onInput={{this.updateWorkspaceName}}
              type="text"
              required
            />
          </UiFormGroup>
        </UiForm>

        {{#if this.shouldShowInlineSubmitButton}}
          <div>
            <UiButton
              @text={{this.submitText}}
              @onClick={{this.onSubmit}}
              @type="submit"
              @disabled={{not this.workspaceNameDraft}}
              form="workspaceForm"
            />
          </div>
        {{/if}}

        {{#if this.shouldShowEmbeddedFooterActions}}
          <UiFooterActions>
            <UiButton
              @text="Save workspace"
              @onClick={{this.onSubmit}}
              @loading={{this.saveRecordTask.isRunning}}
              @disabled={{not this.workspaceNameDraft}}
              class="margin-left-auto"
            />
          </UiFooterActions>
        {{/if}}
      </div>
    {{else}}
      <div class="layout-vertical --max-height route-workspaces-new">
        <div class="header">
          <div class="layout-horizontal --gap-xl">
            <UiIcon @name="app-logo" @size="lg" @custom={{true}} />
            <div class="layout-vertical --gap-sm --flex-shrink">
              <LinkTo @route="workspaces">
                <UiButton
                  @text="Back to Workspaces"
                  @iconLeft="arrow-narrow-left"
                  @hierarchy="tertiary"
                />
              </LinkTo>
              <h1 class="margin-zero">{{this.heading}}</h1>
            </div>
          </div>
          <RoutesWorkspacesHeaderActions />
        </div>
        <div class="body">
          <UiContainer @bordered={{true}}>
            <UiForm id="workspaceForm" @onSubmit={{this.onSubmit}}>
              <UiAvatar
                @model={{@model}}
                @onChange={{this.onAvatarChanged}}
                @squared={{true}}
              />

              <UiFormGroup
                @label="Workspace Name"
                @required={{true}}
                @trailingText="Choose a name that represents your team or organization"
              >
                <UiInput
                  @value={{this.workspaceNameDraft}}
                  @onInput={{this.updateWorkspaceName}}
                  type="text"
                  required
                />
              </UiFormGroup>
            </UiForm>
          </UiContainer>
        </div>
        {{#if this.shouldShowInlineSubmitButton}}
          <div class="footer">
            <UiButton
              @text={{this.submitText}}
              @onClick={{this.onSubmit}}
              @type="submit"
              @disabled={{not this.workspaceNameDraft}}
              form="workspaceForm"
            />
          </div>
        {{/if}}
      </div>
    {{/if}}
  </template>
}
