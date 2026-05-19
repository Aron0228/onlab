import Component from '@glimmer/component';
import { LinkTo } from '@ember/routing';
import { action } from '@ember/object';
import { modifier } from 'ember-modifier';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { WorkspacesEditPullRequestsEditRouteModel } from 'client/routes/workspaces/edit/pull-requests/edit';
import type GithubPullRequestReviewerModel from 'client/models/github-pull-request-reviewer';
import type { PullRequestReviewerStatus } from 'client/models/github-pull-request-reviewer';
import UiIcon from 'client/components/ui/icon';
import UiContainer from 'client/components/ui/container';
import UiButton from 'client/components/ui/button';

const AI_PRIORITY_NOTE_START = '<!-- onlab-ai-priority:start -->';
const AI_PRIORITY_NOTE_END = '<!-- onlab-ai-priority:end -->';

marked.setOptions({
  gfm: true,
  breaks: true,
});

export interface RoutesWorkspacesEditPullRequestsEditSignature {
  Args: {
    model: WorkspacesEditPullRequestsEditRouteModel;
    closeRoute?: string;
    closeModel?: number;
  };
  Blocks: {
    default: [];
  };
  Element: HTMLElement;
}

export default class RoutesWorkspacesEditPullRequestsEdit extends Component<RoutesWorkspacesEditPullRequestsEditSignature> {
  get pullRequest() {
    return this.args.model.pullRequest;
  }

  get riskSelector(): string {
    switch (this.pullRequest.priority) {
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

  get riskLabel(): string {
    switch (this.pullRequest.priority) {
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
  }

  get statusLabel(): string {
    switch (this.pullRequest.status?.toLowerCase()) {
      case 'open':
        return 'OPEN';
      case 'merged':
        return 'MERGED';
      case 'closed':
        return 'CLOSED';
      default:
        return (
          this.pullRequest.status?.replaceAll('_', ' ').toUpperCase() ??
          'UNKNOWN'
        );
    }
  }

  get statusSelector(): string {
    switch (this.pullRequest.status?.toLowerCase()) {
      case 'merged':
        return '--success';
      case 'closed':
        return '--warning';
      default:
        return '--pending';
    }
  }

  get statusIcon(): string {
    switch (this.pullRequest.status?.toLowerCase()) {
      case 'merged':
        return 'circle-check';
      case 'closed':
        return 'info-circle';
      default:
        return 'info-circle';
    }
  }

  get description(): string {
    return (
      this.pullRequest.description?.trim() || 'No description was provided.'
    );
  }

  get sanitizedDescription(): string {
    const notePattern = new RegExp(
      `\\s*${escapeRegExp(AI_PRIORITY_NOTE_START)}[\\s\\S]*?${escapeRegExp(AI_PRIORITY_NOTE_END)}\\s*$`
    );

    return this.description
      .replace(notePattern, '')
      .replace(/^👀\s*/u, '')
      .trim();
  }

  get renderedDescription(): string {
    const source = this.sanitizedDescription || 'No description was provided.';
    const parsedHtml = marked.parse(source) as string;

    return DOMPurify.sanitize(parsedHtml, {
      USE_PROFILES: { html: true },
    });
  }

  get analysisSummary(): string {
    return (
      this.pullRequest.priorityReason?.trim() ||
      'No AI merge risk summary is available for this pull request yet.'
    );
  }

  get repositoryName(): string {
    return this.args.model.repositoryName ?? 'Unknown repository';
  }

  get githubPullRequestUrl(): string | null {
    const repositoryFullName = this.args.model.repositoryFullName;

    if (!repositoryFullName) {
      return null;
    }

    return `https://github.com/${repositoryFullName}/pull/${this.pullRequest.githubPrNumber}`;
  }

  get reviewers(): GithubPullRequestReviewerModel[] {
    return [...(this.pullRequest.reviewers ?? [])].sort(
      (firstReviewer, secondReviewer) =>
        this.reviewerStatusRank(firstReviewer.status) -
          this.reviewerStatusRank(secondReviewer.status) ||
        firstReviewer.githubLogin.localeCompare(secondReviewer.githubLogin)
    );
  }

  get hasReviewers(): boolean {
    return this.reviewers.length > 0;
  }

  get pendingReviewerCount(): number {
    return this.reviewers.filter((reviewer) => reviewer.status === 'pending')
      .length;
  }

  get progressedReviewerCount(): number {
    return this.reviewers.length - this.pendingReviewerCount;
  }

  get closeRoute(): string {
    return this.args.closeRoute ?? 'workspaces.edit.pull-requests';
  }

  get closeModel(): number {
    return this.args.closeModel ?? this.args.model.workspaceId;
  }

  applyRenderedDescription = modifier(
    (element: HTMLElement, [html]: [string]) => {
      element.innerHTML = html;
    }
  );

  @action
  openPullRequestOnGithub(): void {
    if (!this.githubPullRequestUrl) {
      return;
    }

    globalThis.open?.(this.githubPullRequestUrl, '_blank', 'noopener');
  }

  reviewerStatusLabel = (
    status: PullRequestReviewerStatus | null | undefined
  ): string => {
    switch (status) {
      case 'approved':
        return 'Approved';
      case 'changes_requested':
        return 'Changes requested';
      case 'commented':
        return 'Commented';
      case 'dismissed':
        return 'Dismissed';
      default:
        return 'Pending';
    }
  };

  reviewerStatusSelector = (
    status: PullRequestReviewerStatus | null | undefined
  ): string => {
    switch (status) {
      case 'approved':
        return '--approved';
      case 'changes_requested':
        return '--changes-requested';
      case 'commented':
        return '--commented';
      case 'dismissed':
        return '--dismissed';
      default:
        return '--pending';
    }
  };

  reviewerStatusIcon = (
    status: PullRequestReviewerStatus | null | undefined
  ): string => {
    switch (status) {
      case 'approved':
        return 'circle-check';
      case 'changes_requested':
        return 'circle-x';
      case 'commented':
        return 'message-circle';
      case 'dismissed':
        return 'circle-minus';
      default:
        return 'clock';
    }
  };

  reviewerActivityLabel = (
    reviewer: GithubPullRequestReviewerModel
  ): string => {
    if (reviewer.reviewedAt) {
      return `Reviewed ${formatDateTime(reviewer.reviewedAt)}`;
    }

    if (reviewer.lastNotifiedAt) {
      return `Reminded ${formatDateTime(reviewer.lastNotifiedAt)}`;
    }

    return 'Awaiting review';
  };

  private reviewerStatusRank(status: PullRequestReviewerStatus): number {
    switch (status) {
      case 'changes_requested':
        return 0;
      case 'approved':
        return 1;
      case 'commented':
        return 2;
      case 'pending':
        return 3;
      case 'dismissed':
        return 4;
      default:
        return 5;
    }
  }

  <template>
    <aside class="route-workspaces-edit-pull-requests-edit">
      <div class="pull-request-edit-panel layout-vertical --gap-lg">
        <div class="pull-request-edit-panel__header layout-horizontal --gap-md">
          <LinkTo
            @route={{this.closeRoute}}
            @model={{this.closeModel}}
            class="mobile-detail-back"
            aria-label="Back to pull requests"
          >
            <UiIcon @name="arrow-left" />
          </LinkTo>

          <div class="layout-horizontal --gap-sm">
            <UiIcon @name="git-pull-request" @variant="primary" />
            <h2 class="margin-zero">
              PR #{{this.pullRequest.githubPrNumber}}
            </h2>
          </div>

          <LinkTo
            @route={{this.closeRoute}}
            @model={{this.closeModel}}
            class="issue-panel__close"
            aria-label="Close pull request details"
          >
            <UiIcon @name="x" />
          </LinkTo>
        </div>

        {{#if this.githubPullRequestUrl}}
          <UiButton
            class="pull-request-edit-github-button"
            @text="Open on GitHub"
            @hierarchy="secondary"
            @iconRight="external-link"
            @onClick={{this.openPullRequestOnGithub}}
          />
        {{/if}}

        <div class="layout-vertical --gap-md">
          <h3 class="pull-request-edit-panel__title margin-zero">
            {{this.pullRequest.title}}
          </h3>

          <div
            class="pull-request-edit-panel__badges layout-horizontal --gap-sm --wrap"
          >
            <div
              class="pull-request-risk
                {{this.riskSelector}}
                layout-horizontal --gap-xs"
            >
              <UiIcon @name="circle-arrow-up" @size="sm" />
              <span class="font-size-text-sm">{{this.riskLabel}}</span>
            </div>

            <div
              class="pull-request-status
                {{this.statusSelector}}
                layout-horizontal --gap-xs"
            >
              <UiIcon @name={{this.statusIcon}} @variant="primary" />
              {{this.statusLabel}}
            </div>
          </div>
        </div>

        <UiContainer
          @bordered={{true}}
          @variant="primary"
          class="pull-request-edit-analysis"
        >
          <:header>
            <div class="layout-horizontal --gap-sm">
              <UiIcon @name="shield" @variant="primary" />
              <h3 class="margin-zero">AI Merge Risk Analysis</h3>
            </div>
          </:header>
          <:default>
            <div class="layout-vertical --gap-md">
              <div
                class="pull-request-risk
                  {{this.riskSelector}}
                  layout-horizontal --gap-xs"
              >
                <UiIcon @name="circle-arrow-up" @size="sm" />
                <span class="font-size-text-sm">{{this.riskLabel}}</span>
              </div>

              <p class="pull-request-edit-analysis__content margin-zero">
                {{this.analysisSummary}}
              </p>
            </div>
          </:default>
        </UiContainer>

        <div class="pull-request-edit-section layout-vertical --gap-sm">
          <span class="pull-request-edit-section__label">DESCRIPTION</span>
          <div
            class="pull-request-edit-markdown pull-request-edit-section__content"
            {{this.applyRenderedDescription this.renderedDescription}}
          ></div>
        </div>

        <UiContainer @bordered={{true}} class="pull-request-reviewers-section">
          <:header>
            <div class="layout-horizontal --gap-sm --wrap">
              <div class="layout-horizontal --gap-sm">
                <UiIcon @name="users" @variant="primary" />
                <h3 class="margin-zero">Reviewers</h3>
              </div>

              {{#if this.hasReviewers}}
                <span class="pull-request-reviewers-summary">
                  {{this.progressedReviewerCount}}
                  responded ·
                  {{this.pendingReviewerCount}}
                  pending
                </span>
              {{/if}}
            </div>
          </:header>
          <:default>
            {{#if this.hasReviewers}}
              <div class="pull-request-reviewers-list layout-vertical --gap-sm">
                {{#each this.reviewers as |reviewer|}}
                  <div class="pull-request-reviewer-row">
                    <div class="layout-horizontal --gap-sm">
                      <span class="pull-request-reviewer-avatar">
                        {{reviewerInitials reviewer.githubLogin}}
                      </span>
                      <div class="layout-vertical --gap-xs">
                        <span class="font-weight-medium">
                          @{{reviewer.githubLogin}}
                        </span>
                        <span
                          class="font-size-text-sm font-color-text-secondary"
                        >
                          {{#if reviewer.userId}}
                            Linked user #{{reviewer.userId}}
                          {{else}}
                            GitHub reviewer
                          {{/if}}
                        </span>
                      </div>
                    </div>

                    <div class="layout-vertical --gap-xs">
                      <span
                        class="pull-request-reviewer-status
                          {{this.reviewerStatusSelector reviewer.status}}"
                      >
                        <UiIcon
                          @name={{this.reviewerStatusIcon reviewer.status}}
                          @size="sm"
                        />
                        {{this.reviewerStatusLabel reviewer.status}}
                      </span>
                      <span
                        class="pull-request-reviewer-activity font-size-text-sm"
                      >
                        {{this.reviewerActivityLabel reviewer}}
                      </span>
                    </div>
                  </div>
                {{/each}}
              </div>
            {{else}}
              <div
                class="pull-request-reviewers-empty layout-vertical --gap-xs"
              >
                <span class="font-weight-medium">
                  No reviewers have been requested yet.
                </span>
                <span class="font-color-text-secondary">
                  Reviewer assignments will appear here after GitHub sync or AI
                  reviewer suggestions run.
                </span>
              </div>
            {{/if}}
          </:default>
        </UiContainer>

        <div class="pull-request-edit-section layout-vertical --gap-md">
          <span class="pull-request-edit-section__label">DETAILS</span>

          <div class="pull-request-edit-metadata">
            <div class="pull-request-edit-metadata__item">
              <span class="pull-request-edit-metadata__label">Status</span>
              <span class="pull-request-edit-metadata__value">
                {{this.statusLabel}}
              </span>
            </div>

            <div class="pull-request-edit-metadata__item">
              <span class="pull-request-edit-metadata__label">Merge Risk</span>
              <span class="pull-request-edit-metadata__value">
                {{this.riskLabel}}
              </span>
            </div>

            <div class="pull-request-edit-metadata__item">
              <span class="pull-request-edit-metadata__label">Repository</span>
              <span class="pull-request-edit-metadata__value">
                {{this.repositoryName}}
              </span>
            </div>

            <div class="pull-request-edit-metadata__item">
              <span class="pull-request-edit-metadata__label">Author</span>
              <span class="pull-request-edit-metadata__value">
                {{#if this.pullRequest.authorId}}
                  Author #{{this.pullRequest.authorId}}
                {{else}}
                  Unavailable
                {{/if}}
              </span>
            </div>

            <div class="pull-request-edit-metadata__item">
              <span class="pull-request-edit-metadata__label">GitHub PR</span>
              <span class="pull-request-edit-metadata__value">
                #{{this.pullRequest.githubPrNumber}}
              </span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  </template>
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function reviewerInitials(login: string): string {
  return login.trim().slice(0, 2).toUpperCase() || '?';
}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(value);
}
