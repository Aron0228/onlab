import Component from '@glimmer/component';
import { LinkTo } from '@ember/routing';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import UiContainer from 'client/components/ui/container';
import UiIcon from 'client/components/ui/icon';
import type NewsFeedEntryModel from 'client/models/news-feed-entry';
import type { WorkspacesEditNewsFeedRouteModel } from 'client/routes/workspaces/edit/news-feed';

type DayGroup = {
  label: string;
  entries: NewsFeedEntryModel[];
};

const AI_PRIORITY_NOTE_START = '<!-- onlab-ai-priority:start -->';
const AI_PRIORITY_NOTE_END = '<!-- onlab-ai-priority:end -->';

export interface RoutesWorkspacesEditNewsFeedSignature {
  Args: {
    model: WorkspacesEditNewsFeedRouteModel;
  };
  Blocks: {
    default: [];
  };
  Element: HTMLDivElement;
}

export default class RoutesWorkspacesEditNewsFeed extends Component<RoutesWorkspacesEditNewsFeedSignature> {
  getSanitizedCardText = (
    value: string | null | undefined,
    options: {
      fallback?: string;
    } = {}
  ): string => {
    const source = this.stripPredictionNote(value).trim();

    if (!source) {
      return options.fallback ?? '';
    }

    const parsedHtml = marked.parse(source, {
      async: false,
      breaks: true,
      gfm: true,
    });
    const sanitizedHtml = DOMPurify.sanitize(parsedHtml, {
      USE_PROFILES: { html: true },
    });

    if (typeof document === 'undefined') {
      return stripHtmlTags(sanitizedHtml).trim();
    }

    const container = document.createElement('div');
    container.innerHTML = sanitizedHtml;

    return container.textContent?.trim() ?? '';
  };

  getEntrySummary = (entry: NewsFeedEntryModel): string => {
    return this.getSanitizedCardText(entry.summary, {
      fallback: 'No description was provided.',
    });
  };

  stripPredictionNote(value: string | null | undefined): string {
    if (!value) {
      return '';
    }

    const notePattern = new RegExp(
      `\\s*${escapeRegExp(AI_PRIORITY_NOTE_START)}[\\s\\S]*?${escapeRegExp(
        AI_PRIORITY_NOTE_END
      )}\\s*$`
    );

    return value
      .replace(notePattern, '')
      .replace(/^👀\s*/u, '')
      .trim();
  }

  get groups(): DayGroup[] {
    const groupedEntries = new Map<string, NewsFeedEntryModel[]>();

    for (const entry of this.args.model.entries) {
      const label = toDayLabel(entry.happenedAt);
      const existingEntries = groupedEntries.get(label) ?? [];
      existingEntries.push(entry);
      groupedEntries.set(label, existingEntries);
    }

    return Array.from(groupedEntries.entries()).map(([label, entries]) => ({
      label,
      entries,
    }));
  }

  routeForEntry(entry: NewsFeedEntryModel): string {
    switch (entry.sourceType) {
      case 'github-issue':
        return 'workspaces.edit.news-feed.issue';
      case 'github-pull-request':
        return 'workspaces.edit.news-feed.pull-request';
      case 'capacity-plan':
        return 'workspaces.edit.news-feed.capacity-plan';
      default:
        return 'workspaces.edit.news-feed';
    }
  }

  iconForEntry(entry: NewsFeedEntryModel): string {
    switch (entry.sourceType) {
      case 'github-issue':
        return 'exclamation-circle';
      case 'github-pull-request':
        return 'git-pull-request';
      case 'capacity-plan':
        return 'calendar-event';
      default:
        return 'users';
    }
  }

  priorityClass(priority: string | null): string {
    switch ((priority ?? '').toLowerCase()) {
      case 'very-high':
      case 'very high':
      case 'veryhigh':
      case 'critical':
        return '--very-high';
      case 'high':
        return '--high';
      case 'medium':
        return '--medium';
      case 'low':
        return '--low';
      default:
        return '--unknown';
    }
  }

  priorityLabel(priority: string | null): string | null {
    return priority?.replaceAll('-', ' ').toUpperCase() ?? 'UNKNOWN';
  }

  timeAgo = (value: string): string => {
    const now = Date.now();
    const happenedAt = new Date(value).getTime();
    const diffMs = Math.max(0, now - happenedAt);
    const diffHours = Math.floor(diffMs / 3_600_000);

    if (diffHours < 1) {
      const diffMinutes = Math.max(1, Math.floor(diffMs / 60_000));
      return `${diffMinutes}m ago`;
    }

    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  entryMeta = (entry: NewsFeedEntryModel): string => {
    const bits = [
      entry.repositoryName,
      entry.sourceDisplayNumber,
      this.timeAgo(entry.happenedAt),
    ].filter((value): value is string => Boolean(value));

    return bits.join(' • ');
  };

  <template>
    <div class="route-workspaces-edit-news-feed">
      <div class="news-feed__hero layout-vertical --gap-md">
        <div
          class="layout-horizontal --justify-between --align-center --gap-md"
        >
          <div class="layout-vertical --gap-sm">
            <h1 class="margin-zero">Welcome Back!</h1>
            <p class="margin-zero color-secondary">
              Here's what's happening in your workspace.
            </p>
          </div>
        </div>

        <UiContainer @bordered={{true}} @variant="primary">
          <:default>
            <div class="layout-horizontal --gap-md --align-center">
              <div class="news-feed__banner-icon">
                <UiIcon @name="sparkles" @variant="normal" />
              </div>
              <div class="layout-vertical --gap-xs">
                <strong>AI-Curated Feed for Developer</strong>
                <p class="margin-zero color-secondary">
                  Activities are prioritized based on your role, expertise, and
                  relevance. Click any item to view details.
                </p>
              </div>
            </div>
          </:default>
        </UiContainer>
      </div>

      <div class="news-feed__body layout-vertical --gap-lg">
        {{#if this.groups.length}}
          {{#each this.groups as |group|}}
            <section class="news-feed__group layout-vertical --gap-md">
              <div
                class="news-feed__group-header layout-horizontal --gap-sm --align-center"
              >
                <UiIcon @name="calendar-event" />
                <span>{{group.label}}</span>
                <hr class="separator --horizontal --feed" />
              </div>

              <div class="layout-vertical --gap-md">
                {{#each group.entries as |entry|}}
                  {{#if entry.isClickable}}
                    <LinkTo
                      @route={{this.routeForEntry entry}}
                      @model={{entry.sourceId}}
                      class="news-feed-card-link"
                    >
                      <div
                        class="news-feed-card
                          {{this.priorityClass entry.sourcePriority}}"
                      >
                        <div
                          class="news-feed-card__header layout-horizontal --justify-between --gap-md"
                        >
                          <div class="layout-horizontal --gap-md">
                            <div class="news-feed-card__icon">
                              <UiIcon @name={{this.iconForEntry entry}} />
                            </div>
                            <div class="layout-vertical --gap-sm">
                              <h3 class="margin-zero">{{entry.title}}</h3>
                              <p class="margin-zero color-secondary">
                                {{this.getEntrySummary entry}}
                              </p>
                            </div>
                          </div>

                          <div
                            class="issue-ai-priority
                              {{this.priorityClass entry.sourcePriority}}
                              layout-horizontal --gap-xs margin-left-auto"
                          >
                            <UiIcon @name="circle-arrow-up" @size="sm" />
                            <span class="font-size-text-sm">
                              {{this.priorityLabel entry.sourcePriority}}
                            </span>
                          </div>
                        </div>

                        {{#if entry.aiReason}}
                          <div class="news-feed-card__reason">
                            <div
                              class="news-feed-card__reason-line layout-horizontal --gap-sm"
                            >
                              <UiIcon
                                @name="trending-up"
                                @size="sm"
                                @variant="info"
                              />
                              <span class="news-feed-card__reason-label">
                                Why this matters:
                              </span>
                              <span class="news-feed-card__reason-text">
                                {{this.getSanitizedCardText entry.aiReason}}
                              </span>
                            </div>
                          </div>
                        {{/if}}

                        <div class="news-feed-card__meta">
                          {{this.entryMeta entry}}
                        </div>
                      </div>
                    </LinkTo>
                  {{else}}
                    <div class="news-feed-card is-disabled">
                      <div
                        class="news-feed-card__header layout-horizontal --justify-between --gap-md"
                      >
                        <div class="layout-horizontal --gap-md">
                          <div class="news-feed-card__icon">
                            <UiIcon @name={{this.iconForEntry entry}} />
                          </div>
                          <div class="layout-vertical --gap-sm">
                            <h3 class="margin-zero">{{entry.title}}</h3>
                            <p class="margin-zero color-secondary">
                              {{this.getEntrySummary entry}}
                            </p>
                          </div>
                        </div>

                        <div
                          class="issue-ai-priority
                            {{this.priorityClass entry.sourcePriority}}
                            layout-horizontal --gap-xs margin-left-auto"
                        >
                          <UiIcon @name="circle-arrow-up" @size="sm" />
                          <span class="font-size-text-sm">
                            {{this.priorityLabel entry.sourcePriority}}
                          </span>
                        </div>
                      </div>

                      {{#if entry.aiReason}}
                        <div class="news-feed-card__reason">
                          <div
                            class="news-feed-card__reason-line layout-horizontal --gap-sm"
                          >
                            <UiIcon
                              @name="circle-arrow-up"
                              @size="sm"
                              @variant="info"
                            />
                            <span class="news-feed-card__reason-label">
                              Why this matters:
                            </span>
                            <span class="news-feed-card__reason-text">
                              {{this.getSanitizedCardText entry.aiReason}}
                            </span>
                          </div>
                        </div>
                      {{/if}}

                      <div class="news-feed-card__meta">
                        {{this.entryMeta entry}}
                      </div>
                    </div>
                  {{/if}}
                {{/each}}
              </div>
            </section>
          {{/each}}
        {{else}}
          <UiContainer @bordered={{true}} class="news-feed__empty">
            <:default>
              <p class="margin-zero color-secondary">
                No news feed entries yet. New activity will start appearing here
                as your workspace changes.
              </p>
            </:default>
          </UiContainer>
        {{/if}}
      </div>
    </div>
  </template>
}

function toDayLabel(value: string): string {
  const date = new Date(value);
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
  const startOfDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
  const diffDays = Math.round(
    (startOfToday.getTime() - startOfDate.getTime()) / 86_400_000
  );

  if (diffDays === 0) {
    return 'Today';
  }

  if (diffDays === 1) {
    return 'Yesterday';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function stripHtmlTags(value: string): string {
  return value.replace(/<[^>]+>/g, ' ');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
