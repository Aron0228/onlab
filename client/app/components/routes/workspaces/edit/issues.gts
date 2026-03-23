import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { inject as service } from '@ember/service';
import { task } from 'ember-concurrency';
import { task as trackedTask } from 'reactiveweb/ember-concurrency';
import type { WorkspacesEditIssuesRouteModel } from 'client/routes/workspaces/edit/issues';
import UiIcon from 'client/components/ui/icon';
import UiButton from 'client/components/ui/button';
import UiContainer from 'client/components/ui/container';
import UiLoadingSpinner from 'client/components/ui/loading-spinner';

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
  @service store;

  @tracked activeFilters: string[] = [];

  fetchWorkspaceIssuesTask = task(async () => {
    const repositoryIds = this.args.model.repositories.map((repo) => repo.id);

    const issues = this.store.query('github-issue', {
      filter: {
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

  get workspaceIssues() {
    return this.lastWorkspaceIssues.value ?? [];
  }

  get filters() {
    return [
      { title: 'VERY HIGH', count: 2, selector: '--very-high' },
      { title: 'HIGH', count: 2, selector: '--high' },
      { title: 'MEDIUM', count: 2, selector: '--medium' },
      { title: 'LOW', count: 2, selector: '--low' },
      { title: 'UNKNOWN', count: 2, selector: '--unknown' },
    ];
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
            <UiButton @iconLeft="plus" @text="Create Issue" />
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

        {{#each this.workspaceIssues as |workspaceIssue|}}
          <UiContainer class="issue-card">
            <:header>
              <div class="layout-horizontal --gap-sm">
                <UiIcon @name="exclamation-circle" />
                <span class="font-weight-bold">
                  #{{workspaceIssue.githubIssueNumber}}
                </span>

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
        {{/each}}
      </div>
    </div>
  </template>
}
