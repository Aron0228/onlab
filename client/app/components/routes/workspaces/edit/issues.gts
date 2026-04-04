import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { LinkTo } from '@ember/routing';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { inject as service } from '@ember/service';
import { task } from 'ember-concurrency';
import { task as trackedTask } from 'reactiveweb/ember-concurrency';
import type { WorkspacesEditIssuesRouteModel } from 'client/routes/workspaces/edit/issues';
import type GithubIssueModel from 'client/models/github-issue';
import UiIcon from 'client/components/ui/icon';
import UiButton from 'client/components/ui/button';
import UiContainer from 'client/components/ui/container';
import UiLoadingSpinner from 'client/components/ui/loading-spinner';

type RouterLike = {
  transitionTo(route: string): void;
};

type StoreLike = {
  query(
    modelName: 'github-issue',
    options: Record<string, unknown>
  ): Promise<GithubIssueModel[]> | GithubIssueModel[];
};

export interface RoutesWorkspacesEditIssuesSignature {
  // The arguments accepted by the component
  Args: {
    model: WorkspacesEditIssuesRouteModel;
  };
  // Any blocks yielded by the component
  Blocks: {
    default: [];
  };
  // The element to which `...attributes` is applied in the component template
  Element: null;
}

export default class RoutesWorkspacesEditIssues extends Component<RoutesWorkspacesEditIssuesSignature> {
  @service declare store: StoreLike;
  @service declare router: RouterLike;

  @tracked activeFilters: string[] = [];

  fetchWorkspaceIssuesTask = task(async () => {
    const repositoryIds = this.args.model.repositories.map((repo) => repo.id);

    const issues = await this.store.query('github-issue', {
      filter: {
        include: ['aiPrediction'],
        where: {
          repositoryId: { inq: repositoryIds },
        },
      },
    });

    return issues;
  });

  lastWorkspaceIssues = trackedTask(
    this,
    this.fetchWorkspaceIssuesTask,
    () => []
  );

  get workspaceIssues(): GithubIssueModel[] {
    return (this.lastWorkspaceIssues.value as GithubIssueModel[]) ?? [];
  }

  get filters() {
    const issues = this.workspaceIssues;

    return [
      {
        title: 'VERY HIGH',
        count: issues.filter((issue) => issue.priority === 'Very-High').length,
        selector: '--very-high',
      },
      {
        title: 'HIGH',
        count: issues.filter((issue) => issue.priority === 'High').length,
        selector: '--high',
      },
      {
        title: 'MEDIUM',
        count: issues.filter((issue) => issue.priority === 'Medium').length,
        selector: '--medium',
      },
      {
        title: 'LOW',
        count: issues.filter((issue) => issue.priority === 'Low').length,
        selector: '--low',
      },
      {
        title: 'UNKNOWN',
        count: issues.filter(
          (issue) => !issue.priority || issue.priority === 'Unknown'
        ).length,
        selector: '--unknown',
      },
    ];
  }

  prioritySelector = (priority: string | null | undefined): string => {
    switch (priority) {
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
  };

  priorityLabel = (priority: string | null | undefined): string => {
    switch (priority) {
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
  };

  issueEditModels = (
    issueId: string | number | null | undefined,
    githubIssueNumber: number
  ): [number, string | number] => {
    return [Number(this.args.model.workspace.id), issueId ?? githubIssueNumber];
  };

  get filteredWorkspaceIssues() {
    if (!this.activeFilters.length) {
      return this.workspaceIssues;
    }

    return this.workspaceIssues.filter((issue) =>
      this.activeFilters.includes(this.prioritySelector(issue.priority))
    );
  }

  isFilterActive = (selector: string) => {
    return this.activeFilters.includes(selector);
  };

  @action
  toggleFilter(selector: string): void {
    if (this.activeFilters.includes(selector)) {
      this.activeFilters = this.activeFilters.filter(
        (activeSelector) => activeSelector !== selector
      );
      return;
    }

    this.activeFilters = [...this.activeFilters, selector];
  }

  @action
  openNewIssue(): void {
    this.router.transitionTo('workspaces.edit.issues.new');
  }

  <template>
    <div class="route-workspaces-edit-issues layout-vertical --gap-md">
      {{#if this.lastWorkspaceIssues.isRunning}}
        <UiLoadingSpinner @backdrop={{true}} />
      {{/if}}

      <div class="issues-header layout-vertical --gap-md">
        <div class="layout-horizontal --flex-grow">
          <div class="layout-vertical">
            <div class="layout-horizontal --gap-sm">
              <UiIcon @name="exclamation-circle" @variant="primary" />
              <h2 class="margin-zero">Issues</h2>
            </div>

            <span class="font-color-text-secondary">
              AI-powered issue prioritization and tracking
            </span>
          </div>
          <div class="margin-left-auto">
            <UiButton
              @iconLeft="plus"
              @text="Create Issue"
              @onClick={{this.openNewIssue}}
            />
          </div>
        </div>

        <div class="issues-filters layout-horizontal --gap-md --wrap">
          {{#each this.filters as |filter|}}
            <button
              class="issue-filter
                {{filter.selector}}
                {{if (this.isFilterActive filter.selector) '--active'}}"
              type="button"
              {{on "click" (fn this.toggleFilter filter.selector)}}
            >
              <span class="font-weight-bold">{{filter.title}}</span>
              <span
                class="margin-zero font-weight-bold font-size-text-lg"
              >{{filter.count}}</span>
            </button>
          {{/each}}
        </div>
      </div>

      <div class="issues-body layout-vertical --gap-lg">

        {{#each this.filteredWorkspaceIssues as |workspaceIssue|}}
          <LinkTo
            @route="workspaces.edit.issues.edit"
            @models={{this.issueEditModels
              workspaceIssue.id
              workspaceIssue.githubIssueNumber
            }}
            class="issue-card-link
              {{this.prioritySelector workspaceIssue.priority}}"
          >
            <UiContainer class="issue-card">
              <:header>
                <div class="layout-horizontal --gap-sm">
                  <UiIcon @name="exclamation-circle" />
                  <span class="font-weight-bold">
                    #{{workspaceIssue.githubIssueNumber}}
                  </span>
                  <div
                    class="issue-ai-priority
                      {{this.prioritySelector workspaceIssue.priority}}
                      layout-horizontal --gap-xs"
                  >
                    <UiIcon @name="circle-arrow-up" @size="sm" />

                    <span class="font-size-text-sm">{{this.priorityLabel
                        workspaceIssue.priority
                      }}</span>
                  </div>

                  <div
                    class="issue-status layout-horizontal --gap-xs margin-left-auto"
                  >
                    <UiIcon @name="info-circle" @variant="primary" />
                    {{workspaceIssue.status}}
                  </div>
                </div>
              </:header>
              <:default>
                <span class="font-weight-medium font-size-text-lg">
                  {{workspaceIssue.title}}
                </span>
              </:default>
            </UiContainer>
          </LinkTo>
        {{/each}}

        {{#unless this.filteredWorkspaceIssues.length}}
          <UiContainer class="issue-empty-state">
            <:default>
              <div class="layout-vertical --gap-sm">
                <span class="font-weight-medium">No issues match these filters.</span>
                <span class="font-color-text-secondary">
                  Try removing a priority filter or wait for the next repository
                  sync.
                </span>
              </div>
            </:default>
          </UiContainer>
        {{/unless}}
      </div>
    </div>
  </template>
}
