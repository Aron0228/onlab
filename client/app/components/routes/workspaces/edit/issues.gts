import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { LinkTo } from '@ember/routing';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { service } from '@ember/service';
import { didCancel, restartableTask, task, timeout } from 'ember-concurrency';
import { modifier } from 'ember-modifier';
import type { WorkspacesEditIssuesRouteModel } from 'client/routes/workspaces/edit/issues';
import type GithubIssueModel from 'client/models/github-issue';
import loadMoreWhenVisible from 'client/modifiers/load-more-when-visible';
import mergeRecordsById from 'client/utils/merge-records-by-id';
import UiIcon from 'client/components/ui/icon';
import UiButton from 'client/components/ui/button';
import UiContainer from 'client/components/ui/container';
import UiLoadingSpinner from 'client/components/ui/loading-spinner';

const AI_PRIORITY_NOTE_START = '<!-- onlab-ai-priority:start -->';
const AI_PRIORITY_NOTE_END = '<!-- onlab-ai-priority:end -->';
const ISSUE_PAGE_SIZE = 25;

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
  @tracked workspaceIssues: GithubIssueModel[] = [];
  @tracked issueOffset = 0;
  @tracked hasMoreIssues = true;
  @tracked hasLoadedInitialIssues = false;
  @tracked searchQuery = '';
  private paginationScopeKey: string | null = null;
  private paginationGeneration = 0;

  loadIssuesPageTask = task(async () => {
    if (!this.hasMoreIssues) {
      return;
    }

    const repositoryIds = this.repositoryIds;
    const searchQuery = this.normalizedSearchQuery;
    const generation = this.paginationGeneration;
    const offset = this.issueOffset;

    if (!repositoryIds.length) {
      this.hasMoreIssues = false;
      this.hasLoadedInitialIssues = true;
      return;
    }

    const where: Record<string, unknown> = {
      repositoryId: { inq: repositoryIds },
    };

    if (searchQuery) {
      const searchTerm = `%${escapeLikeTerm(searchQuery)}%`;
      where.or = [
        { title: { ilike: searchTerm } },
        { description: { ilike: searchTerm } },
      ];
    }

    const issues = await this.store.query('github-issue', {
      filter: {
        include: ['aiPrediction'],
        limit: ISSUE_PAGE_SIZE,
        skip: offset,
        order: ['id DESC'],
        where,
      },
    });

    if (
      generation !== this.paginationGeneration ||
      searchQuery !== this.normalizedSearchQuery ||
      offset !== this.issueOffset
    ) {
      return;
    }

    this.issueOffset += issues.length;
    this.hasMoreIssues = issues.length === ISSUE_PAGE_SIZE;
    this.hasLoadedInitialIssues = true;
    this.workspaceIssues = mergeRecordsById(this.workspaceIssues, issues);
  });

  searchIssuesTask = restartableTask(async () => {
    await timeout(250);
    this.loadNextPage();
  });

  get repositoryIds(): Array<string | number> {
    return this.args.model.repositories.flatMap((repo) =>
      repo.id == null ? [] : [repo.id]
    );
  }

  get repositoryScopeKey(): string {
    return this.repositoryIds.join(',');
  }

  get normalizedSearchQuery(): string {
    return this.searchQuery.trim();
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

  analysisSummary = (priorityReason: string | null | undefined): string => {
    const trimmedReason = priorityReason?.trim();

    if (trimmedReason) {
      return trimmedReason;
    }

    return 'Awaiting AI priority analysis for this issue.';
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

  get canLoadMore(): boolean {
    return this.hasMoreIssues && !this.loadIssuesPageTask.isRunning;
  }

  get showInitialLoading(): boolean {
    return !this.hasLoadedInitialIssues && this.loadIssuesPageTask.isRunning;
  }

  get showNextPageLoading(): boolean {
    return this.hasLoadedInitialIssues && this.loadIssuesPageTask.isRunning;
  }

  initializePagination = modifier((_element, [scopeKey]: [string]) => {
    if (this.paginationScopeKey === scopeKey) {
      return;
    }

    this.paginationScopeKey = scopeKey;

    queueMicrotask(() => {
      this.resetPagination();
      this.loadNextPage();
    });
  });

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
  updateSearchQuery(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.searchQuery = target.value;

    void this.loadIssuesPageTask.cancelAll();
    this.resetPagination();
    this.searchIssuesTask.perform().catch((error: unknown) => {
      logTaskError('Failed to search issues', error);
    });
  }

  @action
  openNewIssue(): void {
    this.router.transitionTo('workspaces.edit.issues.new');
  }

  @action
  loadNextPage(): void {
    if (!this.canLoadMore) {
      return;
    }

    this.loadIssuesPageTask.perform().catch((error: unknown) => {
      logTaskError('Failed to load issues page', error);
    });
  }

  private resetPagination(): void {
    this.paginationGeneration += 1;
    this.workspaceIssues = [];
    this.issueOffset = 0;
    this.hasMoreIssues = true;
    this.hasLoadedInitialIssues = false;
  }

  <template>
    <div
      class="route-workspaces-edit-issues layout-vertical --gap-md"
      {{this.initializePagination this.repositoryScopeKey}}
    >
      {{#if this.showInitialLoading}}
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

        <div class="issues-search-container layout-horizontal --gap-sm">
          <UiIcon @name="search" />
          <input
            type="text"
            class="issues-search-input"
            aria-label="Search issues"
            placeholder="Search issues..."
            value={{this.searchQuery}}
            {{on "input" this.updateSearchQuery}}
          />
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
                <div class="issue-card__header layout-horizontal --gap-sm">
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
                <div class="layout-vertical --gap-md">
                  <span class="font-weight-medium font-size-text-lg">
                    {{workspaceIssue.title}}
                  </span>

                  {{#if (this.cleanDescription workspaceIssue.description)}}
                    <p class="issue-summary margin-zero">
                      {{this.cleanDescription workspaceIssue.description}}
                    </p>
                  {{/if}}

                  <div class="issue-analysis layout-horizontal --gap-xs">
                    <UiIcon @name="sparkles" @variant="primary" @size="sm" />
                    <span class="font-weight-bold">
                      AI Analysis:
                    </span>
                    <span>
                      {{this.analysisSummary workspaceIssue.priorityReason}}
                    </span>
                  </div>
                </div>
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

        {{#if this.showNextPageLoading}}
          <div class="issue-list-pagination-loader">
            <UiLoadingSpinner />
          </div>
        {{/if}}

        <div
          class="issue-list-sentinel"
          aria-hidden="true"
          {{loadMoreWhenVisible this.loadNextPage enabled=this.canLoadMore}}
        ></div>
      </div>
    </div>
  </template>
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeLikeTerm(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function logTaskError(message: string, error: unknown): void {
  if (didCancel(error)) {
    return;
  }

  console.error(message, error);
}
