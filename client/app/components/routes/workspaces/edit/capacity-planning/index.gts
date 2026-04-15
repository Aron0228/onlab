import Component from '@glimmer/component';
import { hash } from '@ember/helper';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { LinkTo } from '@ember/routing';
import UiContainer from 'client/components/ui/container';
import UiIcon from 'client/components/ui/icon';
import type CapacityPlanEntryModel from 'client/models/capacity-plan-entry';
import type CapacityPlanModel from 'client/models/capacity-plan';
import type IssueAssignmentModel from 'client/models/issue-assignment';
import type { WorkspacesEditCapacityPlanningRouteModel } from 'client/routes/workspaces/edit/capacity-planning';
import { eq } from 'ember-truth-helpers';

type CapacityPlanTab = 'current' | 'upcoming' | 'past';

export interface RoutesWorkspacesEditCapacityPlanningIndexSignature {
  Args: {
    model: WorkspacesEditCapacityPlanningRouteModel;
  };
  Blocks: {
    default: [];
  };
  Element: HTMLDivElement;
}

export default class RoutesWorkspacesEditCapacityPlanningIndex extends Component<RoutesWorkspacesEditCapacityPlanningIndexSignature> {
  @tracked selectedTab: CapacityPlanTab = 'past';

  get rootClass(): string {
    return 'route-workspaces-edit-capacity-planning';
  }

  get today(): Date {
    return new Date();
  }

  get plans(): CapacityPlanModel[] {
    return this.args.model.plans.filter(
      (plan) => this.planCategory(plan) === this.selectedTab
    );
  }

  get currentCount(): number {
    return this.args.model.plans.filter(
      (plan) => this.planCategory(plan) === 'current'
    ).length;
  }

  get upcomingCount(): number {
    return this.args.model.plans.filter(
      (plan) => this.planCategory(plan) === 'upcoming'
    ).length;
  }

  get pastCount(): number {
    return this.args.model.plans.filter(
      (plan) => this.planCategory(plan) === 'past'
    ).length;
  }

  get headerSubtitle(): string {
    return `Manage team workload and sprint planning for ${this.args.model.workspace.name}.`;
  }

  entriesForPlan = (plan: CapacityPlanModel): CapacityPlanEntryModel[] => {
    return this.args.model.entries.filter(
      (entry) => Number(entry.capacityPlanId) === Number(plan.id)
    );
  };

  assignmentsForPlan = (plan: CapacityPlanModel): IssueAssignmentModel[] => {
    return this.args.model.issueAssignments.filter(
      (assignment) => Number(assignment.capacityPlanId) === Number(plan.id)
    );
  };

  planCategory = (plan: CapacityPlanModel): CapacityPlanTab => {
    const today = this.today;
    const start = new Date(plan.start);
    const end = new Date(plan.end);

    if (start <= today && end >= today) {
      return 'current';
    }

    if (start > today) {
      return 'upcoming';
    }

    return 'past';
  };

  progressPercent = (plan: CapacityPlanModel): number => {
    const totalHours = this.entriesForPlan(plan).reduce(
      (sum, entry) => sum + Number(entry.capacityHours ?? 0),
      0
    );

    if (totalHours <= 0) {
      return 0;
    }

    const allocatedHours = this.assignmentsForPlan(plan).reduce(
      (sum, assignment) => sum + Number(assignment.assignedHours ?? 0),
      0
    );

    return Math.round((allocatedHours / totalHours) * 100);
  };

  progressStyle = (plan: CapacityPlanModel): string => {
    return `width: ${this.progressPercent(plan)}%;`;
  };

  totalHoursForPlan = (plan: CapacityPlanModel): number => {
    return this.entriesForPlan(plan).reduce(
      (sum, entry) => sum + Number(entry.capacityHours ?? 0),
      0
    );
  };

  allocatedHoursForPlan = (plan: CapacityPlanModel): number => {
    return this.assignmentsForPlan(plan).reduce(
      (sum, assignment) => sum + Number(assignment.assignedHours ?? 0),
      0
    );
  };

  teamCountForPlan = (plan: CapacityPlanModel): number => {
    return new Set(
      this.entriesForPlan(plan).map((entry) => Number(entry.userId))
    ).size;
  };

  issuesCountForPlan = (plan: CapacityPlanModel): number => {
    return new Set(
      this.assignmentsForPlan(plan).map((assignment) =>
        Number(assignment.issueId)
      )
    ).size;
  };

  assignmentsCountForPlan = (plan: CapacityPlanModel): number => {
    return this.assignmentsForPlan(plan).length;
  };

  tabClass = (tab: CapacityPlanTab): string => {
    return `capacity-planning-tab ${this.selectedTab === tab ? '--active' : ''}`;
  };

  formatPlanPeriod = (plan: CapacityPlanModel): string => {
    const formatter = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    return `${formatter.format(new Date(plan.start))} - ${formatter.format(
      new Date(plan.end)
    )}`;
  };

  @action selectTab(tab: CapacityPlanTab) {
    this.selectedTab = tab;
  }

  <template>
    <div class={{this.rootClass}} ...attributes>
      <div class="capacity-planning-header">
        <div class="layout-horizontal --space-between --align-center --gap-md">
          <div class="layout-vertical --gap-sm">
            <div class="capacity-planning-title-row layout-horizontal --gap-sm">
              <UiIcon @name="calendar-event" />
              <h1 class="margin-zero">Capacity Planning</h1>
            </div>
            <p class="margin-zero color-secondary">{{this.headerSubtitle}}</p>
          </div>

          <LinkTo
            @route="workspaces.edit.capacity-planning.new"
            class="capacity-planning-header__action"
          >
            <UiIcon @name="plus" />
            <span>New Plan</span>
          </LinkTo>
        </div>

        <div class="capacity-planning-tabs">
          <button
            type="button"
            class={{this.tabClass "current"}}
            {{on "click" (fn this.selectTab "current")}}
          >
            Current Week ({{this.currentCount}})
          </button>
          <button
            type="button"
            class={{this.tabClass "upcoming"}}
            {{on "click" (fn this.selectTab "upcoming")}}
          >
            Upcoming ({{this.upcomingCount}})
          </button>
          <button
            type="button"
            class={{this.tabClass "past"}}
            {{on "click" (fn this.selectTab "past")}}
          >
            Past Plans ({{this.pastCount}})
          </button>
        </div>
      </div>

      <div class="capacity-planning-body">
        {{#if this.plans.length}}
          <div class="capacity-planning-grid">
            {{#each this.plans as |plan|}}
              <UiContainer @bordered={{true}} class="capacity-planning-card">
                <div class="layout-vertical --gap-lg">
                  <div class="layout-vertical --gap-sm">
                    <div
                      class="layout-horizontal --space-between --align-center --gap-md"
                    >
                      <h2 class="margin-zero">{{this.formatPlanPeriod
                          plan
                        }}</h2>
                      <span class="capacity-planning-card__state">
                        {{if
                          (eq (this.planCategory plan) "past")
                          "Archived"
                          (if
                            (eq (this.planCategory plan) "current")
                            "In Progress"
                            "Upcoming"
                          )
                        }}
                      </span>
                    </div>
                    <p class="margin-zero color-secondary">
                      Plan #{{plan.id}}
                    </p>
                  </div>

                  <div class="layout-vertical --gap-sm">
                    <div
                      class="layout-horizontal --space-between --align-center --gap-md"
                    >
                      <span>Capacity Utilization</span>
                      <strong>
                        {{this.allocatedHoursForPlan plan}}h /
                        {{this.totalHoursForPlan plan}}h ({{this.progressPercent
                          plan
                        }}%)
                      </strong>
                    </div>
                    <div class="capacity-planning-card__progress">
                      <div
                        class="capacity-planning-card__progress-bar"
                        style={{this.progressStyle plan}}
                      ></div>
                    </div>
                  </div>

                  <div class="capacity-planning-card__metrics">
                    <div class="capacity-planning-card__metric">
                      <span class="color-secondary">Team</span>
                      <strong>{{this.teamCountForPlan plan}}</strong>
                    </div>
                    <div class="capacity-planning-card__metric">
                      <span class="color-secondary">Issues</span>
                      <strong>{{this.issuesCountForPlan plan}}</strong>
                    </div>
                    <div class="capacity-planning-card__metric">
                      <span class="color-secondary">Assigned</span>
                      <strong>{{this.assignmentsCountForPlan plan}}</strong>
                    </div>
                  </div>

                  <div class="capacity-planning-card__note">
                    <span
                      class="capacity-planning-card__note-label"
                    >Summary</span>
                    <p class="margin-zero">
                      {{this.teamCountForPlan plan}}
                      team members contributed
                      {{this.totalHoursForPlan plan}}h of planned capacity
                      across
                      {{this.issuesCountForPlan plan}}
                      tracked issues.
                    </p>
                  </div>

                  <div class="capacity-planning-card__actions">
                    <LinkTo
                      @route="workspaces.edit.capacity-planning.edit"
                      @query={{hash planId=plan.id}}
                      class="capacity-planning-card__view"
                    >
                      <UiIcon @name="eye" />
                      <span>{{if
                          (eq (this.planCategory plan) "past")
                          "View"
                          "Open"
                        }}</span>
                    </LinkTo>
                  </div>
                </div>
              </UiContainer>
            {{/each}}
          </div>
        {{else}}
          <UiContainer @bordered={{true}} class="capacity-planning-empty">
            <div class="layout-vertical --gap-sm">
              <h2 class="margin-zero">No plans in this section yet</h2>
              <p class="margin-zero color-secondary">
                Start a new weekly plan to balance workload across the team.
              </p>
              <LinkTo
                @route="workspaces.edit.capacity-planning.new"
                class="capacity-planning-empty__action"
              >
                <UiIcon @name="plus" />
                <span>Create First Plan</span>
              </LinkTo>
            </div>
          </UiContainer>
        {{/if}}
      </div>
    </div>
  </template>
}
