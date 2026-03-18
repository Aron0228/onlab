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
import UiThemeSwitcher from 'client/components/ui/theme-switcher';
import UiIcon from 'client/components/ui/icon';
import UiContainer from 'client/components/ui/container';
import UiAvatar from 'client/components/ui/avatar';
import UiLoadingSpinner from 'client/components/ui/loading-spinner';
import RouteProfile from 'client/components/route-profile';
import UiLanguageSelector from 'client/components/ui/language-selector';
import { LinkTo } from '@ember/routing';
import { on } from '@ember/modifier';
import { and, not } from 'ember-truth-helpers';

export interface RoutesWorkspacesNewSignature {
  // The arguments accepted by the component
  Args: {};
  // Any blocks yielded by the component
  Blocks: {
    default: [];
  };
  // The element to which `...attributes` is applied in the component template
  Element: null;
}

export default class RoutesWorkspacesNew extends Component<RoutesWorkspacesNewSignature> {
  @service store;
  @service api;
  @service session;
  @service sessionAccount;
  @service router;
  @service flashMessages;

  @tracked selectedAvatarFile: File | null = null;

  saveRecordTask = task(async () => {
    const workspace = await this.store.saveRecord(this.args.model);

    if (!this.selectedAvatarFile) {
      return;
    }

    const fileRecord = await this.uploadAvatar(
      workspace.id,
      this.selectedAvatarFile
    );

    const apiHost =
      (import.meta.env.VITE_API_URL as string) ?? 'http://localhost:30022';
    const previewUrl = new URL(`${apiHost}/files/${fileRecord.id}/preview`);

    workspace.avatarUrl = previewUrl.toString();

    await this.store.saveRecord(workspace);

    this.flashMessages.success('Your workspace has been save successfully!', {
      title: 'Success',
    });
  });

  async uploadAvatar(workspaceId: number, file: File) {
    const token = this.session.data.authenticated?.token;
    const params = {
      workspaceId: workspaceId,
      originalName: file.name,
      token: token,
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

  @action
  updateWorkspaceName(value: string): void {
    this.args.model.name = value;
  }

  @action
  onSubmit(event: SubmitEvent) {
    event.preventDefault();

    this.saveRecordTask.perform().catch((error) => {
      this.flashMessages.danger(error.message, {
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
        <div class="layout-horizontal --gap-md maring-left-auto">
          <UiLanguageSelector />
          <UiThemeSwitcher />
          <hr class="separator --vertical" />
          <RouteProfile @routeBack="workspaces.new" />
        </div>
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
          @text="Create Workspace"
          @onClick={{this.onSubmit}}
          @type="submit"
          @disabled={{not (and this.selectedAvatarFile @model.name)}}
          form="workspaceForm"
        />
      </div>
    </div>
  </template>
}
