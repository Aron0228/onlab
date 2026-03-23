import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { inject as service } from '@ember/service';
import { task } from 'ember-concurrency';
import { task as trackedTask } from 'reactiveweb/ember-concurrency';
import type { WorkspacesEditPullRequestsRouteModel } from 'client/routes/workspaces/edit/pull-requests';
import UiIcon from 'client/components/ui/icon';
import UiContainer from 'client/components/ui/container';
import UiLoadingSpinner from 'client/components/ui/loading-spinner';

export interface RoutesWorkspacesEditPullRequestsSignature {
  // The arguments accepted by the component
  Args: {
    model: WorkspacesEditPullRequestsRouteModel;
  };
  // Any blocks yielded by the component
  Blocks: {
    default: [];
  };
  // The element to which `...attributes` is applied in the component template
  Element: null;
}

export default class RoutesWorkspacesEditPullRequests extends Component<RoutesWorkspacesEditPullRequestsSignature> {
  @service store;

  @tracked activeFilters: string[] = [];

  fetchWorkspacePullRequestsTask = task(async () => {
    const repositoryIds = this.args.model.repositories.map((repo) => repo.id);

    const pullRequests = this.store.query('github-pull-request', {
      filter: {
        where: {
          repositoryId: { inq: repositoryIds },
        },
      },
    });

    return pullRequests;
  });

  lastWorkspacePullRequests = trackedTask(
    this,
    this.fetchWorkspacePullRequestsTask,
    () => []
  );

  get workspacePullRequests() {
    return this.lastWorkspacePullRequests.value ?? [];
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
    <div class="route-workspaces-edit-pull-requests layout-vertical --gap-md">
      {{#if this.lastWorkspacePullRequests.isRunning}}
        <UiLoadingSpinner @backdrop={{true}} />
      {{/if}}

      <div class="pull-requests-header layout-vertical --gap-md">
        <div class="layout-horizontal --flex-grow">
          <div class="layout-vertical">
            <div class="layout-horizontal --gap-sm">
              <UiIcon @name="git-pull-request" @variant="primary" />
              <h2 class="margin-zero">Pull Requests</h2>
            </div>

            <span class="font-color-text-secondary">
              AI-powered pull request prioritization and tracking
            </span>
          </div>
        </div>

        <div class="pull-request-filters layout-horizontal --gap-md --wrap">
          {{#each this.filters as |filter|}}
            <button
              class="pull-request-filter
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

      <div class="pull-requests-body layout-vertical --gap-lg">
        {{#each this.workspacePullRequests as |workspacePullRequest|}}
          <UiContainer class="pull-request-card">
            <:header>
              <div class="layout-horizontal --gap-sm">
                <UiIcon @name="git-pull-request" />
                <span class="font-weight-bold">
                  #{{workspacePullRequest.githubPrNumber}}
                </span>

                <div
                  class="pull-request-status layout-horizontal --gap-xs margin-left-auto"
                >
                  <UiIcon @name="info-circle" @variant="primary" />
                  {{workspacePullRequest.status}}
                </div>
              </div>
            </:header>
            <:default>
              <div class="layout-vertical --gap-sm">
                <span class="font-weight-medium font-size-text-lg">
                  {{workspacePullRequest.title}}
                </span>

                {{#if workspacePullRequest.description}}
                  <span class="font-color-text-secondary">
                    {{workspacePullRequest.description}}
                  </span>
                {{/if}}
              </div>
            </:default>
          </UiContainer>
        {{/each}}
      </div>
    </div>
  </template>
}
