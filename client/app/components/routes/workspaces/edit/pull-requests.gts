import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { LinkTo } from '@ember/routing';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { inject as service } from '@ember/service';
import { task } from 'ember-concurrency';
import { task as trackedTask } from 'reactiveweb/ember-concurrency';
import type { WorkspacesEditPullRequestsRouteModel } from 'client/routes/workspaces/edit/pull-requests';
import type GithubPullRequestModel from 'client/models/github-pull-request';
import UiIcon from 'client/components/ui/icon';
import UiContainer from 'client/components/ui/container';
import UiLoadingSpinner from 'client/components/ui/loading-spinner';

const AI_PRIORITY_NOTE_START = '<!-- onlab-ai-priority:start -->';
const AI_PRIORITY_NOTE_END = '<!-- onlab-ai-priority:end -->';

type StoreLike = {
  query(
    modelName: 'github-pull-request',
    options: Record<string, unknown>
  ): Promise<GithubPullRequestModel[]> | GithubPullRequestModel[];
};

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
  @service declare store: StoreLike;

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

  get workspacePullRequests(): GithubPullRequestModel[] {
    return (
      (this.lastWorkspacePullRequests.value as GithubPullRequestModel[]) ?? []
    );
  }

  get filters() {
    const pullRequests = this.workspacePullRequests;

    return [
      {
        title: 'VERY HIGH',
        count: pullRequests.filter((pr) => pr.priority === 'Very-High').length,
        selector: '--very-high',
      },
      {
        title: 'HIGH',
        count: pullRequests.filter((pr) => pr.priority === 'High').length,
        selector: '--high',
      },
      {
        title: 'MEDIUM',
        count: pullRequests.filter((pr) => pr.priority === 'Medium').length,
        selector: '--medium',
      },
      {
        title: 'LOW',
        count: pullRequests.filter((pr) => pr.priority === 'Low').length,
        selector: '--low',
      },
      {
        title: 'UNKNOWN',
        count: pullRequests.filter(
          (pr) => !pr.priority || pr.priority === 'Unknown'
        ).length,
        selector: '--unknown',
      },
    ];
  }

  riskSelector = (risk: string | null | undefined): string => {
    switch (risk) {
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

  riskLabel = (risk: string | null | undefined): string => {
    switch (risk) {
      case 'Very-High':
        return 'VERY HIGH RISK';
      case 'High':
        return 'HIGH RISK';
      case 'Medium':
        return 'MEDIUM RISK';
      case 'Low':
        return 'LOW RISK';
      default:
        return 'UNKNOWN RISK';
    }
  };

  pullRequestEditModels = (
    pullRequestId: string | number | null | undefined,
    githubPrNumber: number
  ): [number, string | number] => {
    return [
      Number(this.args.model.workspace.id),
      pullRequestId ?? githubPrNumber,
    ];
  };

  get filteredPullRequests() {
    if (!this.activeFilters.length) {
      return this.workspacePullRequests;
    }

    return this.workspacePullRequests.filter((pullRequest) =>
      this.activeFilters.includes(this.riskSelector(pullRequest.priority))
    );
  }

  repositoryName = (repositoryId: number | null | undefined): string => {
    const repository = this.args.model.repositories.find(
      (repo) => repo.id === repositoryId
    );

    return repository?.name ?? 'Unknown repository';
  };

  statusLabel = (status: string | null | undefined): string => {
    switch (status?.toLowerCase()) {
      case 'open':
        return 'OPEN';
      case 'merged':
        return 'MERGED';
      case 'closed':
        return 'CLOSED';
      default:
        return (status ?? 'UNKNOWN').replaceAll('_', ' ').toUpperCase();
    }
  };

  statusSelector = (status: string | null | undefined): string => {
    switch (status?.toLowerCase()) {
      case 'merged':
        return '--success';
      case 'closed':
        return '--warning';
      default:
        return '--pending';
    }
  };

  statusIcon = (status: string | null | undefined): string => {
    switch (status?.toLowerCase()) {
      case 'merged':
        return 'circle-check';
      case 'closed':
        return 'info-circle';
      default:
        return 'info-circle';
    }
  };

  cleanDescription = (description: string | null | undefined): string => {
    if (!description) {
      return '';
    }

    const notePattern = new RegExp(
      `\\s*${escapeRegExp(AI_PRIORITY_NOTE_START)}[\\s\\S]*?${escapeRegExp(AI_PRIORITY_NOTE_END)}\\s*$`
    );

    return description
      .replace(notePattern, '')
      .replace(/^👀\s*/u, '')
      .trim();
  };

  analysisSummary = (
    priorityReason: string | null | undefined,
    status: string | null | undefined
  ): string => {
    const trimmedReason = priorityReason?.trim();

    if (trimmedReason) {
      return trimmedReason;
    }

    switch (status?.toLowerCase()) {
      case 'merged':
        return 'Ready to merge. The latest sync marked this pull request as merged.';
      case 'closed':
        return 'This pull request is closed. Review the latest updates before reopening.';
      default:
        return 'Awaiting AI merge risk analysis for this pull request.';
    }
  };

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
              AI-powered pull request merge risk analysis and tracking
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
        {{#each this.filteredPullRequests as |workspacePullRequest|}}
          <LinkTo
            @route="workspaces.edit.pull-requests.edit"
            @models={{this.pullRequestEditModels
              workspacePullRequest.id
              workspacePullRequest.githubPrNumber
            }}
            class="pull-request-card-link
              {{this.riskSelector workspacePullRequest.priority}}"
          >
            <UiContainer class="pull-request-card">
              <:header>
                <div
                  class="pull-request-card__header layout-horizontal --gap-sm"
                >
                  <div class="layout-horizontal --gap-sm">
                    <UiIcon @name="git-pull-request" />
                    <span class="font-weight-bold">
                      #{{workspacePullRequest.githubPrNumber}}
                    </span>
                    <div
                      class="pull-request-risk
                        {{this.riskSelector workspacePullRequest.priority}}
                        layout-horizontal --gap-xs"
                    >
                      <UiIcon @name="circle-arrow-up" @size="sm" />
                      <span class="font-size-text-sm">
                        {{this.riskLabel workspacePullRequest.priority}}
                      </span>
                    </div>
                  </div>

                  <div
                    class="pull-request-status
                      {{this.statusSelector workspacePullRequest.status}}
                      layout-horizontal --gap-xs margin-left-auto"
                  >
                    <UiIcon
                      @name={{this.statusIcon workspacePullRequest.status}}
                      @variant="primary"
                    />
                    {{this.statusLabel workspacePullRequest.status}}
                  </div>
                </div>
              </:header>
              <:default>
                <div class="layout-vertical --gap-md">
                  <div class="layout-vertical --gap-sm">
                    <span class="font-weight-medium font-size-text-lg">
                      {{workspacePullRequest.title}}
                    </span>

                    <div
                      class="pull-request-meta layout-horizontal --gap-sm --wrap font-color-text-secondary"
                    >
                      <span>
                        {{this.repositoryName
                          workspacePullRequest.repositoryId
                        }}
                      </span>
                      <span
                        class="pull-request-meta__dot"
                        aria-hidden="true"
                      ></span>
                      <span>
                        {{#if workspacePullRequest.authorId}}
                          Author #{{workspacePullRequest.authorId}}
                        {{else}}
                          Author unavailable
                        {{/if}}
                      </span>
                      <span
                        class="pull-request-meta__dot"
                        aria-hidden="true"
                      ></span>
                      <span>
                        {{this.statusLabel workspacePullRequest.status}}
                      </span>
                    </div>
                  </div>

                  {{#if
                    (this.cleanDescription workspacePullRequest.description)
                  }}
                    <p class="pull-request-summary margin-zero">
                      {{this.cleanDescription workspacePullRequest.description}}
                    </p>
                  {{/if}}

                  <div class="pull-request-analysis layout-horizontal --gap-xs">
                    <UiIcon @name="sparkles" @variant="primary" @size="sm" />
                    <span class="font-weight-bold">
                      AI Analysis:
                    </span>
                    <span>
                      {{this.analysisSummary
                        workspacePullRequest.priorityReason
                        workspacePullRequest.status
                      }}
                    </span>
                  </div>
                </div>
              </:default>
            </UiContainer>
          </LinkTo>
        {{/each}}

        {{#unless this.filteredPullRequests.length}}
          <UiContainer class="pull-request-empty-state">
            <:default>
              <div class="layout-vertical --gap-sm">
                <span class="font-weight-medium">No pull requests match these
                  filters.</span>
                <span class="font-color-text-secondary">
                  Try removing a risk filter or wait for the next repository
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
