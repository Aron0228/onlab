import Component from '@glimmer/component';
import { LinkTo } from '@ember/routing';
import { modifier } from 'ember-modifier';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { WorkspacesEditIssuesEditRouteModel } from 'client/routes/workspaces/edit/issues/edit';
import UiIcon from 'client/components/ui/icon';
import UiContainer from 'client/components/ui/container';

const AI_PRIORITY_NOTE_START = '<!-- onlab-ai-priority:start -->';
const AI_PRIORITY_NOTE_END = '<!-- onlab-ai-priority:end -->';

marked.setOptions({
  gfm: true,
  breaks: true,
});

export interface RoutesWorkspacesEditIssuesEditSignature {
  Args: {
    model: WorkspacesEditIssuesEditRouteModel;
    closeRoute?: string;
    closeModel?: number;
  };
  Blocks: {
    default: [];
  };
  Element: HTMLElement;
}

export default class RoutesWorkspacesEditIssuesEdit extends Component<RoutesWorkspacesEditIssuesEditSignature> {
  get issue() {
    return this.args.model.issue;
  }

  get prioritySelector(): string {
    switch (this.issue.priority) {
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
    switch (this.issue.priority) {
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

  get statusLabel(): string {
    return this.issue.status?.toUpperCase() ?? 'UNKNOWN';
  }

  get description(): string {
    return this.issue.description?.trim() || 'No description was provided.';
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

  get priorityReason(): string {
    return (
      this.issue.priorityReason?.trim() ||
      'No AI prioritization summary is available for this issue yet.'
    );
  }

  get repositoryName(): string {
    return this.args.model.repositoryName ?? 'Unknown repository';
  }

  get closeRoute(): string {
    return this.args.closeRoute ?? 'workspaces.edit.issues';
  }

  get closeModel(): number {
    return this.args.closeModel ?? this.args.model.workspaceId;
  }

  applyRenderedDescription = modifier(
    (element: HTMLElement, [html]: [string]) => {
      element.innerHTML = html;
    }
  );

  <template>
    <aside class="route-workspaces-edit-issues-edit">
      <div class="issue-edit-panel layout-vertical --gap-lg">
        <div class="issue-edit-panel__header layout-horizontal --gap-md">
          <div class="layout-horizontal --gap-sm">
            <UiIcon @name="exclamation-circle" @variant="primary" />
            <h2 class="margin-zero">
              Issue #{{this.issue.githubIssueNumber}}
            </h2>
          </div>

          <LinkTo
            @route={{this.closeRoute}}
            @model={{this.closeModel}}
            class="issue-panel__close"
            aria-label="Close issue details"
          >
            <UiIcon @name="x" />
          </LinkTo>
        </div>

        <div class="layout-vertical --gap-md">
          <h3
            class="issue-edit-panel__title margin-zero"
          >{{this.issue.title}}</h3>

          <div
            class="issue-edit-panel__badges layout-horizontal --gap-sm --wrap"
          >
            <div
              class="issue-ai-priority
                {{this.prioritySelector}}
                layout-horizontal --gap-xs"
            >
              <UiIcon @name="circle-arrow-up" @size="sm" />
              <span class="font-size-text-sm">{{this.priorityLabel}}</span>
            </div>

            <div class="issue-status layout-horizontal --gap-xs">
              <UiIcon @name="info-circle" @variant="primary" />
              {{this.statusLabel}}
            </div>
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
              {{this.priorityReason}}
            </p>
          </:default>
        </UiContainer>

        <div class="issue-edit-section layout-vertical --gap-sm">
          <span class="issue-edit-section__label">DESCRIPTION</span>
          <div
            class="issue-edit-markdown issue-edit-section__content"
            {{this.applyRenderedDescription this.renderedDescription}}
          ></div>
        </div>

        <div class="issue-edit-section layout-vertical --gap-md">
          <span class="issue-edit-section__label">DETAILS</span>

          <div class="issue-edit-metadata">
            <div class="issue-edit-metadata__item">
              <span class="issue-edit-metadata__label">Status</span>
              <span
                class="issue-edit-metadata__value"
              >{{this.statusLabel}}</span>
            </div>

            <div class="issue-edit-metadata__item">
              <span class="issue-edit-metadata__label">Priority</span>
              <span
                class="issue-edit-metadata__value"
              >{{this.priorityLabel}}</span>
            </div>

            <div class="issue-edit-metadata__item">
              <span class="issue-edit-metadata__label">Repository</span>
              <span class="issue-edit-metadata__value">
                {{this.repositoryName}}
              </span>
            </div>

            <div class="issue-edit-metadata__item">
              <span class="issue-edit-metadata__label">GitHub Issue</span>
              <span class="issue-edit-metadata__value">
                #{{this.issue.githubIssueNumber}}
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
