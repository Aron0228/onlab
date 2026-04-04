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
import UiLoadingSpinner from 'client/components/ui/loading-spinner';
import { LinkTo } from '@ember/routing';
import { not } from 'ember-truth-helpers';
import RoutesWorkspacesHeaderActions from 'client/components/routes/workspaces/header-actions';

export interface RoutesWorkspacesNewSignature {
  // The arguments accepted by the component
  Args: {
    model: WorkspaceModel;
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
};

export default class RoutesWorkspacesNew extends Component<RoutesWorkspacesNewSignature> {
  @service declare store: StoreLike;
  @service declare api: ApiServiceLike;
  @service declare session: SessionServiceLike;
  @service declare flashMessages: FlashMessagesServiceLike;

  @tracked selectedAvatarFile: File | null = null;

  saveRecordTask = task(async () => {
    const workspace = await this.store.saveRecord(this.args.model);

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

  @action
  updateWorkspaceName(value: string): void {
    this.args.model.name = value;
  }

  @action
  onSubmit(event?: Event) {
    event?.preventDefault();

    this.saveRecordTask.perform().catch((error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : 'Workspace creation failed. Please try again.';

      this.flashMessages.danger(message, {
        title: 'An error occured',
      });
    });
  }

  <template>
    {{#if this.saveRecordTask.isRunning}}
      <UiLoadingSpinner @backdrop={{true}} />
    {{/if}}
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
            <h1 class="margin-zero">Create New Workspace</h1>
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
                @value={{@model.name}}
                @onInput={{this.updateWorkspaceName}}
                type="text"
                required
              />
            </UiFormGroup>

          </UiForm>
        </UiContainer>
      </div>
      <div class="footer">
        <UiButton
          @text="Create Workspace & Install GitHub App"
          @onClick={{this.onSubmit}}
          @type="submit"
          @disabled={{not @model.name}}
          form="workspaceForm"
        />
      </div>
    </div>
  </template>
}
