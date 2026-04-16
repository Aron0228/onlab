import Component from '@glimmer/component';
import { LinkTo } from '@ember/routing';
import UiIcon from 'client/components/ui/icon';
import UiContainer from 'client/components/ui/container';
import type { WorkspacesEditNewsFeedCapacityPlanRouteModel } from 'client/routes/workspaces/edit/news-feed/capacity-plan';

export interface RoutesWorkspacesEditNewsFeedCapacityPlanPanelSignature {
  Args: {
    model: WorkspacesEditNewsFeedCapacityPlanRouteModel;
  };
  Blocks: {
    default: [];
  };
  Element: HTMLElement;
}

export default class RoutesWorkspacesEditNewsFeedCapacityPlanPanel extends Component<RoutesWorkspacesEditNewsFeedCapacityPlanPanelSignature> {
  get totalCapacity(): number {
    return this.args.model.entries.reduce(
      (sum, entry) => sum + Number(entry.capacityHours ?? 0),
      0
    );
  }

  get totalAllocated(): number {
    return this.args.model.issueAssignments.reduce(
      (sum, assignment) => sum + Number(assignment.assignedHours ?? 0),
      0
    );
  }

  get utilizationPercent(): number {
    if (this.totalCapacity <= 0) {
      return 0;
    }

    return Math.round((this.totalAllocated / this.totalCapacity) * 100);
  }

  get sortedEntries() {
    return [...this.args.model.entries].sort((left, right) =>
      (left.user?.fullName ?? '').localeCompare(right.user?.fullName ?? '')
    );
  }

  assignmentsForUser(userId: number) {
    return this.args.model.issueAssignments.filter(
      (assignment) => Number(assignment.userId) === Number(userId)
    );
  }

  formatDate(value: string): string {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(value));
  }

  <template>
    <aside class="route-workspaces-edit-news-feed-capacity-plan-panel">
      <div class="news-feed-capacity-plan-panel layout-vertical --gap-lg">
        <div
          class="news-feed-capacity-plan-panel__header layout-horizontal --gap-md"
        >
          <div class="layout-horizontal --gap-sm">
            <UiIcon @name="calendar-event" @variant="primary" />
            <h2 class="margin-zero">Capacity Plan</h2>
          </div>

          <LinkTo
            @route="workspaces.edit.news-feed"
            @model={{@model.workspaceId}}
            class="issue-panel__close"
            aria-label="Close capacity plan details"
          >
            <UiIcon @name="x" />
          </LinkTo>
        </div>

        <UiContainer @bordered={{true}}>
          <:default>
            <div class="layout-vertical --gap-sm">
              <h3 class="margin-zero">
                {{this.formatDate @model.plan.start}}
                -
                {{this.formatDate @model.plan.end}}
              </h3>
              <div class="layout-horizontal --gap-md --wrap color-secondary">
                <span>Total Capacity: {{this.totalCapacity}}h</span>
                <span>Allocated: {{this.totalAllocated}}h</span>
                <span>Utilization: {{this.utilizationPercent}}%</span>
              </div>
            </div>
          </:default>
        </UiContainer>

        <div class="layout-vertical --gap-md">
          <span class="news-feed-capacity-plan-panel__label">TEAM CAPACITY</span>

          {{#each this.sortedEntries as |entry|}}
            <UiContainer @bordered={{true}} class="layout-vertical --gap-md">
              <:default>
                <div class="layout-vertical --gap-sm">
                  <div class="layout-horizontal --justify-between --gap-md">
                    <strong>{{entry.user.fullName}}</strong>
                    <span
                      class="color-secondary"
                    >{{entry.capacityHours}}h</span>
                  </div>

                  {{#let
                    (this.assignmentsForUser entry.userId)
                    as |assignments|
                  }}
                    {{#if assignments.length}}
                      <div class="layout-vertical --gap-sm">
                        {{#each assignments as |assignment|}}
                          <div
                            class="news-feed-capacity-plan-panel__assignment"
                          >
                            <strong>
                              {{assignment.issue.title}}
                            </strong>
                            <div class="color-secondary">
                              {{assignment.issue.githubIssueNumber}}
                              •
                              {{assignment.assignedHours}}h
                            </div>
                          </div>
                        {{/each}}
                      </div>
                    {{else}}
                      <p class="margin-zero color-secondary">
                        No issues assigned.
                      </p>
                    {{/if}}
                  {{/let}}
                </div>
              </:default>
            </UiContainer>
          {{/each}}
        </div>
      </div>
    </aside>
  </template>
}
