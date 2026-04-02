import Component from '@glimmer/component';
import { LinkTo } from '@ember/routing';
import { modifier } from 'ember-modifier';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { WorkspacesEditPullRequestsEditRouteModel } from 'client/routes/workspaces/edit/pull-requests/edit';
import UiIcon from 'client/components/ui/icon';
import UiContainer from 'client/components/ui/container';

const AI_PRIORITY_NOTE_START = '<!-- onlab-ai-priority:start -->';
const AI_PRIORITY_NOTE_END = '<!-- onlab-ai-priority:end -->';

marked.setOptions({
  gfm: true,
  breaks: true,
});

export interface RoutesWorkspacesEditPullRequestsEditSignature {
  Args: {
    model: WorkspacesEditPullRequestsEditRouteModel;
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

  applyRenderedDescription = modifier(
    (element: HTMLElement, [html]: [string]) => {
      element.innerHTML = html;
    }
  );

  <template>
    <aside class="route-workspaces-edit-pull-requests-edit">
      <div class="pull-request-edit-panel layout-vertical --gap-lg">
        <div class="pull-request-edit-panel__header layout-horizontal --gap-md">
          <div class="layout-horizontal --gap-sm">
            <UiIcon @name="git-pull-request" @variant="primary" />
            <h2 class="margin-zero">
              PR #{{this.pullRequest.githubPrNumber}}
            </h2>
          </div>

          <LinkTo
            @route="workspaces.edit.pull-requests"
            @model={{@model.workspaceId}}
            class="issue-panel__close"
            aria-label="Close pull request details"
          >
            <UiIcon @name="x" />
          </LinkTo>
        </div>

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
