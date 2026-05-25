import Component from '@glimmer/component';
import type WorkspaceModel from 'client/models/workspace';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';
import UiButton from 'client/components/ui/button';
import { task } from 'ember-concurrency';
import { service } from '@ember/service';
import UiForm from 'client/components/ui/form';
import UiFormGroup from 'client/components/ui/form-group';
import UiInput from 'client/components/ui/input';
import UiIcon from 'client/components/ui/icon';
import UiContainer from 'client/components/ui/container';
import UiCheckbox from 'client/components/ui/checkbox';
import UiAvatar from 'client/components/ui/avatar';
import UiFooterActions from 'client/components/ui/footer-actions';
import UiLoadingSpinner from 'client/components/ui/loading-spinner';
import { LinkTo } from '@ember/routing';
import { not } from 'ember-truth-helpers';
import RoutesWorkspacesHeaderActions from 'client/components/routes/workspaces/header-actions';

type WorkspaceSetupStep = 'general' | 'ai';

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
  @tracked issueSyncDraft = Boolean(this.args.model.issueSync);
  @tracked capacityPlanningSyncDraft = Boolean(
    this.args.model.capacityPlanningSync
  );
  @tracked prReviewReminderCronDraft =
    this.args.model.prReviewReminderCron ?? '';
  @tracked prRiskPredictionSyncDraft = Boolean(
    this.args.model.prRiskPredictionSync
  );
  @tracked reviewerSuggestionSyncDraft = Boolean(
    this.args.model.reviewerSuggestionSync
  );
  @tracked activeStep: WorkspaceSetupStep = 'general';
  @tracked didVisitAiSettings = false;

  get hasChanges(): boolean {
    return (
      this.workspaceNameDraft !== (this.args.model.name ?? '') ||
      this.issueSyncDraft !== Boolean(this.args.model.issueSync) ||
      this.capacityPlanningSyncDraft !==
        Boolean(this.args.model.capacityPlanningSync) ||
      this.prReviewReminderCronDraft.trim() !==
        (this.args.model.prReviewReminderCron ?? '') ||
      this.prRiskPredictionSyncDraft !==
        Boolean(this.args.model.prRiskPredictionSync) ||
      this.reviewerSuggestionSyncDraft !==
        Boolean(this.args.model.reviewerSuggestionSync) ||
      Boolean(this.selectedAvatarFile)
    );
  }

  saveRecordTask = task(async () => {
    const isExistingRecord = this.isExistingRecord;
    const previousState = {
      name: this.args.model.name,
      issueSync: this.args.model.issueSync,
      capacityPlanningSync: this.args.model.capacityPlanningSync,
      prReviewReminderCron: this.args.model.prReviewReminderCron,
      prRiskPredictionSync: this.args.model.prRiskPredictionSync,
      reviewerSuggestionSync: this.args.model.reviewerSuggestionSync,
    };

    this.args.model.name = this.workspaceNameDraft.trim();
    this.args.model.issueSync = this.issueSyncDraft;
    this.args.model.capacityPlanningSync = this.capacityPlanningSyncDraft;
    this.args.model.prReviewReminderCron =
      this.prReviewReminderCronDraft.trim() || null;
    this.args.model.prRiskPredictionSync = this.prRiskPredictionSyncDraft;
    this.args.model.reviewerSuggestionSync = this.reviewerSuggestionSyncDraft;

    let workspace: WorkspaceModel;

    try {
      workspace = await this.store.saveRecord(this.args.model);
    } catch (error) {
      this.args.model.name = previousState.name;
      this.args.model.issueSync = previousState.issueSync;
      this.args.model.capacityPlanningSync = previousState.capacityPlanningSync;
      this.args.model.prReviewReminderCron = previousState.prReviewReminderCron;
      this.args.model.prRiskPredictionSync = previousState.prRiskPredictionSync;
      this.args.model.reviewerSuggestionSync =
        previousState.reviewerSuggestionSync;
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
    this.issueSyncDraft = Boolean(workspace.issueSync);
    this.capacityPlanningSyncDraft = Boolean(workspace.capacityPlanningSync);
    this.prReviewReminderCronDraft = workspace.prReviewReminderCron ?? '';
    this.prRiskPredictionSyncDraft = Boolean(workspace.prRiskPredictionSync);
    this.reviewerSuggestionSyncDraft = Boolean(
      workspace.reviewerSuggestionSync
    );
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
    const token = this.session.data.authenticated?.token;
    const installUrl = this.api.buildUrl('/github/installApp', {
      workspaceId: String(workspaceId),
      ...(token ? { token: String(token) } : {}),
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
    return !this.isExistingRecord && this.isAiStep;
  }

  get shouldShowEmbeddedFooterActions(): boolean {
    return this.isEmbedded && this.isExistingRecord && this.hasChanges;
  }

  get canSubmitWorkspace(): boolean {
    const hasRequiredGeneralSettings =
      this.workspaceNameDraft.trim().length > 0;
    const hasCompletedStandaloneSetup =
      !this.requiresAiStepBeforeSubmit || this.didVisitAiSettings;

    return hasRequiredGeneralSettings && hasCompletedStandaloneSetup;
  }

  get requiresAiStepBeforeSubmit(): boolean {
    return !this.isEmbedded && !this.isExistingRecord;
  }

  get canNavigateToAiSettings(): boolean {
    return this.workspaceNameDraft.trim().length > 0;
  }

  get isGeneralStep(): boolean {
    return this.activeStep === 'general';
  }

  get isAiStep(): boolean {
    return this.activeStep === 'ai';
  }

  get setupSliderClass(): string {
    return `workspace-new-step-track ${this.isAiStep ? '--show-ai' : '--show-general'}`;
  }

  get prReviewReminderDescription(): string {
    const expression = this.prReviewReminderCronDraft.trim();

    return expression
      ? `Review reminders will use ${expression}.`
      : 'Optional cron schedule for PR review reminders.';
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
  updateIssueSync(checked: boolean): void {
    this.issueSyncDraft = checked;
  }

  @action
  updateCapacityPlanningSync(checked: boolean): void {
    this.capacityPlanningSyncDraft = checked;
  }

  @action
  updatePrReviewReminderCron(value: string): void {
    this.prReviewReminderCronDraft = value;
  }

  @action
  updatePrRiskPredictionSync(checked: boolean): void {
    this.prRiskPredictionSyncDraft = checked;
  }

  @action
  updateReviewerSuggestionSync(checked: boolean): void {
    this.reviewerSuggestionSyncDraft = checked;
  }

  @action
  showGeneralSettings(): void {
    this.activeStep = 'general';
  }

  @action
  showAiSettings(): void {
    if (!this.canNavigateToAiSettings) return;

    this.activeStep = 'ai';
    this.didVisitAiSettings = true;
  }

  @action
  onSubmit(event?: Event) {
    event?.preventDefault();

    if (!this.canSubmitWorkspace) {
      if (this.canNavigateToAiSettings && this.isGeneralStep) {
        this.showAiSettings();
      }

      return;
    }

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
              @disabled={{not this.canSubmitWorkspace}}
              form="workspaceForm"
            />
          </div>
        {{/if}}

        {{#if this.shouldShowEmbeddedFooterActions}}
          <UiFooterActions class="workspace-new-footer-actions">
            <UiButton
              @text="Save workspace"
              @onClick={{this.onSubmit}}
              @loading={{this.saveRecordTask.isRunning}}
              @disabled={{not this.canSubmitWorkspace}}
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
          <UiContainer
            @bordered={{true}}
            @variant="primary"
            class="workspace-new-team-info"
          >
            <:header>
              <div class="layout-horizontal --gap-sm">
                <UiIcon @name="users" />
                <h2 class="margin-zero">Team Members</h2>
              </div>
            </:header>

            <:default>
              <p class="margin-zero font-color-text-secondary">
                Member invitations stay in workspace settings after creation.
                This avoids accidentally sending a large batch of invitations
                before the workspace and GitHub connection are confirmed.
              </p>
            </:default>
          </UiContainer>

          <UiContainer @bordered={{true}}>
            <UiForm id="workspaceForm" @onSubmit={{this.onSubmit}}>
              <div class="workspace-new-stepper">
                <div class="workspace-new-stepper__status">
                  <div
                    class="workspace-new-step
                      {{if this.isGeneralStep '--active'}}"
                  >
                    <span>1</span>
                    <strong>General</strong>
                  </div>
                  <div
                    class="workspace-new-step {{if this.isAiStep '--active'}}"
                  >
                    <span>2</span>
                    <strong>AI Settings</strong>
                  </div>
                </div>

                <span class="workspace-new-stepper__hint">
                  {{#if this.isGeneralStep}}
                    <UiButton
                      @hierarchy="tertiary"
                      @text="Continue to AI Settings"
                      @iconRight="arrow-narrow-right"
                      @onClick={{this.showAiSettings}}
                      @disabled={{not this.canNavigateToAiSettings}}
                    />
                  {{else}}
                    <UiButton
                      @text="Back to General Settings"
                      @iconLeft="arrow-narrow-left"
                      @hierarchy="tertiary"
                      @onClick={{this.showGeneralSettings}}
                    />
                  {{/if}}
                </span>
              </div>

              <div class="workspace-new-step-viewport">
                <div class={{this.setupSliderClass}}>
                  <section
                    class="workspace-new-section workspace-new-step-page"
                  >
                    <div class="layout-horizontal --gap-md">
                      <UiIcon @name="building-skyscraper" />
                      <div class="layout-vertical --gap-sm">
                        <h2 class="margin-zero">General Settings</h2>
                        <span class="font-color-text-secondary">
                          Start with the basics, then review automation.
                        </span>
                      </div>
                    </div>

                    <div class="workspace-new-identity-card">
                      <UiAvatar
                        @model={{@model}}
                        @onChange={{this.onAvatarChanged}}
                        @squared={{true}}
                      />

                      <div class="layout-vertical --gap-sm --flex-grow">
                        <UiFormGroup
                          @label="Workspace Name"
                          @required={{true}}
                          @trailingText="This is shown in navigation, communication, and GitHub sync screens."
                        >
                          <UiInput
                            @value={{this.workspaceNameDraft}}
                            @onInput={{this.updateWorkspaceName}}
                            @placeholder="Workspace name"
                            type="text"
                            required
                          />
                        </UiFormGroup>

                        <UiFormGroup
                          @label="PR review reminder cron"
                          @trailingText={{this.prReviewReminderDescription}}
                        >
                          <UiInput
                            @value={{this.prReviewReminderCronDraft}}
                            @onInput={{this.updatePrReviewReminderCron}}
                            @placeholder="*/30 * * * *"
                            type="text"
                          />
                        </UiFormGroup>
                      </div>
                    </div>
                  </section>

                  <section
                    class="workspace-new-section workspace-new-step-page"
                  >
                    <div class="layout-horizontal --gap-md">
                      <UiIcon @name="sparkles" @variant="accent" />

                      <div class="layout-vertical --gap-sm">
                        <h2 class="margin-zero">AI Settings</h2>
                        <span class="font-color-text-secondary">
                          Review what should run after GitHub connects.
                        </span>
                      </div>
                    </div>

                    <p class="margin-zero font-color-text-secondary">
                      Choose what should start after GitHub is connected. These
                      are off by default so existing issues and pull requests
                      are not analyzed without your approval.
                    </p>

                    <div class="workspace-new-ai-grid">
                      <div class="workspace-new-ai-card">
                        <span class="workspace-new-ai-card__control">
                          <UiCheckbox
                            @checked={{this.issueSyncDraft}}
                            @onChange={{this.updateIssueSync}}
                          />
                        </span>
                        <span class="workspace-new-ai-card__content">
                          <strong>AI Issue Priorities</strong>
                          <span>Let AI suggest priority levels for issues.</span>
                        </span>
                      </div>

                      <div class="workspace-new-ai-card">
                        <span class="workspace-new-ai-card__control">
                          <UiCheckbox
                            @checked={{this.capacityPlanningSyncDraft}}
                            @onChange={{this.updateCapacityPlanningSync}}
                          />
                        </span>
                        <span class="workspace-new-ai-card__content">
                          <strong>Capacity Planning Sync</strong>
                          <span>
                            Automatically assign issues based on capacity
                            planning.
                          </span>
                        </span>
                      </div>

                      <div class="workspace-new-ai-card">
                        <span class="workspace-new-ai-card__control">
                          <UiCheckbox
                            @checked={{this.reviewerSuggestionSyncDraft}}
                            @onChange={{this.updateReviewerSuggestionSync}}
                          />
                        </span>
                        <span class="workspace-new-ai-card__content">
                          <strong>Reviewer Suggestion Sync</strong>
                          <span>
                            Sync AI-suggested reviewers to pull requests.
                          </span>
                        </span>
                      </div>

                      <div class="workspace-new-ai-card">
                        <span class="workspace-new-ai-card__control">
                          <UiCheckbox
                            @checked={{this.prRiskPredictionSyncDraft}}
                            @onChange={{this.updatePrRiskPredictionSync}}
                          />
                        </span>
                        <span class="workspace-new-ai-card__content">
                          <strong>PR Prediction Sync</strong>
                          <span>
                            Use AI predictions for PR merge time and complexity.
                          </span>
                        </span>
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            </UiForm>
          </UiContainer>
        </div>
        {{#if this.shouldShowInlineSubmitButton}}
          <UiFooterActions class="workspace-new-footer-actions">
            <UiButton
              @text={{this.submitText}}
              @onClick={{this.onSubmit}}
              @loading={{this.saveRecordTask.isRunning}}
              @disabled={{not this.canSubmitWorkspace}}
              class="margin-left-auto"
            />
          </UiFooterActions>
        {{/if}}
      </div>
    {{/if}}
  </template>
}
