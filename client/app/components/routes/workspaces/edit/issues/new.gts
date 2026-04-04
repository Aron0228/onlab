import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';
import { task } from 'ember-concurrency';
import { LinkTo } from '@ember/routing';
import { on } from '@ember/modifier';
import type GithubRepositoryModel from 'client/models/github-repository';
import type { WorkspacesEditIssuesNewRouteModel } from 'client/routes/workspaces/edit/issues/new';
import UiButton from 'client/components/ui/button';
import UiContainer from 'client/components/ui/container';
import UiDropdown from 'client/components/ui/dropdown';
import UiFormGroup from 'client/components/ui/form-group';
import UiIcon from 'client/components/ui/icon';
import UiInput from 'client/components/ui/input';
import UiLoadingSpinner from 'client/components/ui/loading-spinner';

type AnalyzeIssueResponse = {
  priority: string;
  reason: string;
};

type CreateIssueResponse = {
  queued: true;
};

type ApiServiceLike = {
  request(
    path: string,
    options: {
      method: 'POST';
      body: Record<string, number | string | null>;
    }
  ): Promise<AnalyzeIssueResponse | CreateIssueResponse>;
};

type RouterLike = {
  transitionTo(route: string, ...models: Array<number | string>): void;
};

type FlashMessagesServiceLike = {
  success(message: string, options?: { title?: string }): void;
  danger(message: string, options?: { title?: string }): void;
};

export interface RoutesWorkspacesEditIssuesNewSignature {
  Args: {
    model: WorkspacesEditIssuesNewRouteModel;
  };
  Blocks: {
    default: [];
  };
  Element: HTMLElement;
}

export default class RoutesWorkspacesEditIssuesNew extends Component<RoutesWorkspacesEditIssuesNewSignature> {
  @service declare api: ApiServiceLike;
  @service declare router: RouterLike;
  @service declare flashMessages: FlashMessagesServiceLike;

  @tracked selectedRepositoryId: string | null = this.args.model.repositories[0]
    ? String(this.args.model.repositories[0].id)
    : null;
  @tracked title = '';
  @tracked description = '';
  @tracked analysisResult: AnalyzeIssueResponse | null = null;

  get repositories(): GithubRepositoryModel[] {
    return this.args.model.repositories;
  }

  get selectedRepository(): GithubRepositoryModel | null {
    return (
      this.repositories.find(
        (repository) => String(repository.id) === this.selectedRepositoryId
      ) ?? null
    );
  }

  get workspaceId(): number {
    return Number(this.args.model.workspace.id);
  }

  get canAnalyze(): boolean {
    return Boolean(
      this.selectedRepository && this.title.trim() && this.description.trim()
    );
  }

  get canCreate(): boolean {
    return Boolean(this.canAnalyze && this.analysisResult);
  }

  get isAnalyzeDisabled(): boolean {
    return !this.canAnalyze;
  }

  get isCreateDisabled(): boolean {
    return !this.canCreate;
  }

  get prioritySelector(): string {
    switch (this.analysisResult?.priority) {
      case 'Very-High':
        return '--very-high';
      case 'High':
        return '--high';
      case 'Medium':
        return '--medium';
      case 'Low':
        return '--low';
      default:
        return '--unknown';
    }
  }

  get priorityLabel(): string {
    switch (this.analysisResult?.priority) {
      case 'Very-High':
        return 'VERY HIGH';
      case 'High':
        return 'HIGH';
      case 'Medium':
        return 'MEDIUM';
      case 'Low':
        return 'LOW';
      default:
        return 'UNKNOWN';
    }
  }

  analyzeIssueTask = task(async () => {
    if (!this.selectedRepository) {
      return;
    }

    const response = (await this.api.request('/githubIssues/analyzePriority', {
      method: 'POST',
      body: {
        repositoryId: Number(this.selectedRepository.id),
        title: this.title.trim(),
        description: this.description.trim(),
      },
    })) as AnalyzeIssueResponse;

    this.analysisResult = response;
  });

  createIssueTask = task(async () => {
    if (!this.selectedRepository) {
      return;
    }

    const response = (await this.api.request(
      '/githubIssues/createWithPriority',
      {
        method: 'POST',
        body: {
          repositoryId: Number(this.selectedRepository.id),
          title: this.title.trim(),
          description: this.description.trim(),
        },
      }
    )) as CreateIssueResponse;

    if (response.queued) {
      this.flashMessages.success(
        'Your issue has been submitted successfully. Please allow a short time for it to be synchronized with GitHub and appear in the issue list.',
        {
          title: 'Issue queued for synchronization',
        }
      );
    }

    this.router.transitionTo('workspaces.edit.issues', this.workspaceId);
  });

  @action
  selectRepository(repository: GithubRepositoryModel): void {
    this.selectedRepositoryId = String(repository.id);
    this.analysisResult = null;
  }

  @action
  onRepositoryChange(
    repository: {
      id?: string | number | null;
      name?: string;
      fullName?: string;
    } | null
  ): void {
    if (!repository) {
      this.selectedRepositoryId = null;
      this.analysisResult = null;
      return;
    }

    this.selectRepository(repository as GithubRepositoryModel);
  }

  @action
  updateTitle(value: string): void {
    this.title = value;
    this.analysisResult = null;
  }

  @action
  updateDescription(event: Event): void {
    this.description = (event.target as HTMLTextAreaElement).value;
    this.analysisResult = null;
  }

  @action
  analyzeIssue(): void {
    this.analyzeIssueTask.perform().catch((error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : 'Issue analysis failed. Please try again.';

      this.flashMessages.danger(message, {
        title: 'Could not analyze issue',
      });
    });
  }

  @action
  createIssue(): void {
    this.createIssueTask.perform().catch((error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : 'Issue creation failed. Please try again.';

      this.flashMessages.danger(message, {
        title: 'Could not create issue',
      });
    });
  }

  <template>
    <aside class="route-workspaces-edit-issues-new">
      <div class="issue-new-panel layout-vertical --gap-lg">
        <div class="issue-new-panel__header layout-horizontal --gap-sm">
          <div class="layout-horizontal --gap-sm">
            <UiIcon @name="plus" @variant="primary" />
            <div class="layout-vertical --gap-sm">
              <h2 class="margin-zero">Create New Issue</h2>
              <span class="font-color-text-secondary">
                Add a new issue and let AI analyze its priority
              </span>
            </div>
          </div>

          <LinkTo
            @route="workspaces.edit.issues"
            @model={{this.workspaceId}}
            class="issue-panel__close"
            aria-label="Close new issue panel"
          >
            <UiIcon @name="x" />
          </LinkTo>
        </div>

        <div class="layout-vertical --gap-lg">
          <UiFormGroup @label="Repository" @required={{true}}>
            <UiDropdown
              @options={{this.repositories}}
              @selected={{this.selectedRepository}}
              @onChange={{this.onRepositoryChange}}
              @placeholder="Select a repository"
            >
              <:selected as |repository|>
                {{repository.fullName}}
              </:selected>
              <:option as |repository|>
                <div class="layout-vertical">
                  <span>{{repository.name}}</span>
                  <span class="font-color-text-muted font-size-text-sm">
                    {{repository.fullName}}
                  </span>
                </div>
              </:option>
            </UiDropdown>
          </UiFormGroup>

          <UiFormGroup @label="Title" @required={{true}}>
            <UiInput
              @value={{this.title}}
              @onInput={{this.updateTitle}}
              @placeholder="Brief description of the issue..."
            />
          </UiFormGroup>

          <UiFormGroup
            @label="Description"
            @required={{true}}
            @trailingText="Supports Markdown formatting."
          >
            <textarea
              class="ui-input issue-new-panel__textarea"
              value={{this.description}}
              aria-label="Issue description"
              placeholder="Detailed description of the issue, steps to reproduce, expected behavior..."
              {{on "input" this.updateDescription}}
            ></textarea>
          </UiFormGroup>
        </div>

        {{#if this.analysisResult}}
          <div class="layout-vertical --gap-md">
            <div
              class="issue-new-panel__analysis-header layout-horizontal --gap-sm"
            >
              <div
                class="issue-ai-priority
                  {{this.prioritySelector}}
                  layout-horizontal --gap-xs"
              >
                <UiIcon @name="circle-arrow-up" @size="sm" />
                <span class="font-size-text-sm">{{this.priorityLabel}}</span>
              </div>
            </div>

            <UiContainer
              @bordered={{true}}
              @variant="primary"
              class="issue-edit-analysis"
            >
              <:header>
                <div class="layout-horizontal --gap-sm">
                  <UiIcon @name="sparkles" @variant="primary" />
                  <h3 class="margin-zero">AI Priority Analysis</h3>
                </div>
              </:header>
              <:default>
                <p class="issue-edit-analysis__content margin-zero">
                  {{this.analysisResult.reason}}
                </p>
              </:default>
            </UiContainer>
          </div>
        {{/if}}

        {{#if this.analyzeIssueTask.isRunning}}
          <div class="issue-new-panel__loading">
            <UiLoadingSpinner />
          </div>
        {{else}}
          <UiButton
            class="issue-new-panel__action issue-new-panel__analyze"
            @text="Analyze with AI"
            @iconLeft="sparkles"
            @hierarchy="secondary"
            @onClick={{this.analyzeIssue}}
            @disabled={{this.isAnalyzeDisabled}}
          />
        {{/if}}

        <div class="issue-new-panel__footer layout-horizontal --gap-md">
          <UiButton
            class="issue-new-panel__action issue-new-panel__create"
            @text="Create Issue"
            @iconLeft="circle-check"
            @onClick={{this.createIssue}}
            @loading={{this.createIssueTask.isRunning}}
            @disabled={{this.isCreateDisabled}}
          />
        </div>
      </div>
    </aside>
  </template>
}
