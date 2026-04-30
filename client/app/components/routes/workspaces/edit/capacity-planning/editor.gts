import type Owner from '@ember/owner';
import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { fn, hash } from '@ember/helper';
import { on } from '@ember/modifier';
import { inject as service } from '@ember/service';
import { LinkTo } from '@ember/routing';
import { task } from 'ember-concurrency';
import UiAvatar from 'client/components/ui/avatar';
import UiButton from 'client/components/ui/button';
import UiContainer from 'client/components/ui/container';
import UiDatePicker from 'client/components/ui/date-picker';
import UiFormGroup from 'client/components/ui/form-group';
import UiIcon from 'client/components/ui/icon';
import UiInput from 'client/components/ui/input';
import UiLoadingSpinner from 'client/components/ui/loading-spinner';
import type CapacityPlanEntryModel from 'client/models/capacity-plan-entry';
import type CapacityPlanModel from 'client/models/capacity-plan';
import type GithubIssueModel from 'client/models/github-issue';
import type IssueAssignmentModel from 'client/models/issue-assignment';
import type { CapacityPlanningTeamMember } from 'client/routes/workspaces/edit/capacity-planning';
import type { WorkspacesEditCapacityPlanningEditRouteModel } from 'client/routes/workspaces/edit/capacity-planning/edit';
import type { WorkspacesEditCapacityPlanningNewRouteModel } from 'client/routes/workspaces/edit/capacity-planning/new';
import { or } from 'ember-truth-helpers';

type PriorityTone = 'high' | 'medium' | 'low' | 'critical' | 'unknown';

type EditorModel =
  | WorkspacesEditCapacityPlanningNewRouteModel
  | WorkspacesEditCapacityPlanningEditRouteModel;

type SelectedIssue = {
  id: number;
  number: number;
  title: string;
  area: string;
  priority: PriorityTone;
  estimatedHours: number | null;
  estimationConfidence: 'low' | 'medium' | 'high' | null;
};

type AssignmentCard = {
  issueId: number;
  userId: number;
  assignedHours: number;
  issue: GithubIssueModel | null;
  key: string;
};

type FlashMessagesLike = {
  success?(message: string, options?: { title?: string }): void;
  danger(message: string, options?: { title?: string }): void;
};

type RouterLike = {
  transitionTo(
    route: string,
    ...models: Array<number | string | { queryParams: Record<string, unknown> }>
  ): void;
};

type StoreLike = {
  createRecord(
    modelName: 'capacity-plan',
    data: {
      workspaceId: number;
      start: Date;
      end: Date;
    }
  ): CapacityPlanModel;
  createRecord(
    modelName: 'capacity-plan-entry',
    data: {
      capacityPlanId: number;
      userId: number;
      capacityHours: number;
    }
  ): CapacityPlanEntryModel;
  createRecord(
    modelName: 'issue-assignment',
    data: {
      issueId: number;
      userId: number;
      capacityPlanId: number;
      assignedHours: number;
    }
  ): IssueAssignmentModel;
  saveRecord<T>(record: T): Promise<T>;
};

export interface RoutesWorkspacesEditCapacityPlanningEditorSignature {
  Args: {
    model: EditorModel;
    mode: 'new' | 'edit';
  };
  Blocks: {
    default: [];
  };
  Element: HTMLDivElement;
}

export default class RoutesWorkspacesEditCapacityPlanningEditor extends Component<RoutesWorkspacesEditCapacityPlanningEditorSignature> {
  @service declare store: StoreLike;
  @service declare flashMessages: FlashMessagesLike;
  @service declare router: RouterLike;

  @tracked selectedIssueId: number | null = null;
  @tracked notes = '';
  @tracked weeklyHoursOverrides: Record<number, string> = {};
  @tracked assignedHoursOverrides: Record<string, string> = {};
  @tracked draftAssignmentsByIssueId: Record<
    number,
    {
      userId: number;
      assignedHours: string;
    }
  > = {};
  @tracked draggedIssueId: number | null = null;
  @tracked dropTargetUserId: number | null = null;
  @tracked startDate = '';
  @tracked endDate = '';

  constructor(
    owner: Owner,
    args: RoutesWorkspacesEditCapacityPlanningEditorSignature['Args']
  ) {
    super(owner, args);

    if (this.isNewMode) {
      this.weeklyHoursOverrides = Object.fromEntries(
        Object.entries(this.newModel.draftCapacityHoursByUserId).map(
          ([userId, hours]) => [Number(userId), String(hours)]
        )
      );
      this.notes = `Create a new plan for ${this.args.model.workspace.name} using the current team and issue backlog.`;
    } else {
      this.startDate = this.selectedPlan?.start ?? '';
      this.endDate = this.selectedPlan?.end ?? '';
      this.notes = this.selectedPlan
        ? `Plan #${this.selectedPlan.id} has ${this.savedAssignments.length} assigned issue entries.`
        : `No saved capacity plan is available for ${this.args.model.workspace.name} yet.`;
    }

    this.selectedIssueId = this.unassignedIssues[0]?.id ?? null;
  }

  get isNewMode(): boolean {
    return this.args.mode === 'new';
  }

  get isEditMode(): boolean {
    return this.args.mode === 'edit';
  }

  get newModel(): WorkspacesEditCapacityPlanningNewRouteModel {
    return this.args.model as WorkspacesEditCapacityPlanningNewRouteModel;
  }

  get selectedPlan(): CapacityPlanModel | null {
    if (this.isEditMode) {
      return (this.args.model as WorkspacesEditCapacityPlanningEditRouteModel)
        .selectedPlan;
    }

    return null;
  }

  get savedEntries(): CapacityPlanEntryModel[] {
    if (!this.selectedPlan) {
      return [];
    }

    return this.args.model.entries.filter(
      (entry) => Number(entry.capacityPlanId) === Number(this.selectedPlan?.id)
    );
  }

  get savedAssignments(): IssueAssignmentModel[] {
    if (!this.selectedPlan) {
      return [];
    }

    return this.args.model.issueAssignments.filter(
      (assignment) =>
        Number(assignment.capacityPlanId) === Number(this.selectedPlan?.id)
    );
  }

  get modeClass(): string {
    return `--mode-${this.args.mode}`;
  }

  get pageTitle(): string {
    return this.isNewMode ? 'Create Capacity Plan' : 'View Capacity Plan';
  }

  get pageSubtitle(): string {
    if (this.isNewMode) {
      return `Build a focused plan from open issues and team availability in ${this.args.model.workspace.name}.`;
    }

    if (this.selectedPlan) {
      return 'Saved plan snapshot. GitHub assignments were mirrored when the plan was created if sync was enabled.';
    }

    return `No saved capacity plan is available for ${this.args.model.workspace.name} yet.`;
  }

  get submitLabel(): string {
    return this.isNewMode ? 'Create Plan' : 'Saved Plan';
  }

  get isSubmitDisabled(): boolean {
    return this.isEditMode || !this.canCreatePlan;
  }

  get canCreatePlan(): boolean {
    return Boolean(this.startDate.trim() && this.endDate.trim());
  }

  get hasSelectedIssue(): boolean {
    return Boolean(this.isNewMode && this.selectedIssue);
  }

  get syncStatusLabel(): string {
    if (!this.args.model.workspace.githubInstallationId) {
      return 'GitHub not connected';
    }

    return this.args.model.workspace.capacityPlanningSync
      ? 'GitHub sync on'
      : 'GitHub sync off';
  }

  get syncStatusClass(): string {
    return `capacity-plan-editor__sync-pill ${
      this.args.model.workspace.capacityPlanningSync &&
      this.args.model.workspace.githubInstallationId
        ? '--active'
        : ''
    }`;
  }

  get estimateCoverageLabel(): string {
    const estimatedIssues = this.args.model.issues.filter(
      (issue) => typeof issue.estimatedHours === 'number'
    ).length;

    return `${estimatedIssues}/${this.args.model.issues.length} issues estimated`;
  }

  get unassignedEstimateTotal(): number {
    return this.unassignedIssues.reduce(
      (sum, issue) => sum + (issue.estimatedHours ?? 0),
      0
    );
  }

  get selectedIssueSuggestion(): string {
    if (!this.selectedIssue) {
      return 'Select an issue to see the suggested assignment.';
    }

    const bestFit = this.bestFitMemberForIssue(this.selectedIssue);
    const estimateLabel = this.selectedIssue.estimatedHours
      ? `${this.selectedIssue.estimatedHours}h estimate`
      : 'no estimate yet';

    if (!bestFit) {
      return `Issue #${this.selectedIssue.number} has ${estimateLabel}.`;
    }

    return `Issue #${this.selectedIssue.number} has ${estimateLabel}; best fit by remaining capacity is ${this.memberDisplayName(bestFit)}.`;
  }

  get assignButtonText(): string {
    if (!this.selectedIssue) {
      return 'Assign selected issue';
    }

    return `Assign Issue #${this.selectedIssue.number}`;
  }

  get selectedIssue(): SelectedIssue | null {
    return (
      this.unassignedIssues.find(
        (issue) => Number(issue.id) === Number(this.selectedIssueId)
      ) ?? null
    );
  }

  get totalCapacity(): number {
    return this.args.model.teamMembers.reduce(
      (sum, member) => sum + this.weeklyHoursFor(member),
      0
    );
  }

  get totalAllocated(): number {
    return this.args.model.teamMembers.reduce(
      (sum, member) => sum + this.memberAssignedHours(member),
      0
    );
  }

  get utilizationPercent(): number {
    if (this.totalCapacity <= 0) {
      return 0;
    }

    return Math.round((this.totalAllocated / this.totalCapacity) * 100);
  }

  get draftAssignments(): AssignmentCard[] {
    return Object.entries(this.draftAssignmentsByIssueId).map(
      ([issueId, assignment]) => ({
        issueId: Number(issueId),
        userId: assignment.userId,
        assignedHours: this.parseHours(assignment.assignedHours),
        issue: this.issueById(Number(issueId)),
        key: `${assignment.userId}:${issueId}`,
      })
    );
  }

  get unassignedIssues(): SelectedIssue[] {
    const assignedIssueIds = new Set(
      (this.isNewMode ? this.draftAssignments : this.savedAssignments).map(
        (assignment) => Number(assignment.issueId)
      )
    );

    return this.args.model.issues
      .filter((issue) => !assignedIssueIds.has(Number(issue.id)))
      .map((issue) => ({
        id: Number(issue.id),
        number: Number(issue.githubIssueNumber),
        title: issue.title,
        area: this.issueRepositoryName(issue),
        priority: this.priorityTone(issue.priority),
        estimatedHours: issue.estimatedHours,
        estimationConfidence: issue.estimationConfidence,
      }));
  }

  priorityTone(priority: string | null): PriorityTone {
    switch (priority) {
      case 'High':
        return 'high';
      case 'Medium':
        return 'medium';
      case 'Low':
        return 'low';
      case 'Very-High':
        return 'critical';
      default:
        return 'unknown';
    }
  }

  parseHours(value: string | number | null | undefined): number {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : 0;
    }

    return Number.parseInt(value ?? '', 10) || 0;
  }

  serializeDateValue(value: string): Date {
    const [year, month, day] = value.split('-').map((part) => Number(part));

    if (!year || !month || !day) {
      throw new Error('Please choose a valid date.');
    }

    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }

  issueById(issueId: number): GithubIssueModel | null {
    return (
      this.args.model.issues.find((issue) => Number(issue.id) === issueId) ??
      null
    );
  }

  weeklyHoursFor = (member: CapacityPlanningTeamMember): number => {
    const override = this.weeklyHoursOverrides[Number(member.user.id)];

    if (override !== undefined) {
      return this.parseHours(override);
    }

    const matchingEntry = this.savedEntries.find(
      (entry) => Number(entry.userId) === Number(member.user.id)
    );

    return Number(matchingEntry?.capacityHours ?? 0);
  };

  memberAssignments = (
    member: CapacityPlanningTeamMember
  ): AssignmentCard[] => {
    if (this.isNewMode) {
      return this.draftAssignments.filter(
        (assignment) => Number(assignment.userId) === Number(member.user.id)
      );
    }

    return this.savedAssignments
      .filter(
        (assignment) => Number(assignment.userId) === Number(member.user.id)
      )
      .map((assignment) => ({
        issueId: Number(assignment.issueId),
        userId: Number(assignment.userId),
        assignedHours:
          this.parseHours(
            this.assignedHoursOverrides[
              `${Number(member.user.id)}:${Number(assignment.issueId)}`
            ]
          ) || Number(assignment.assignedHours ?? 0),
        issue:
          assignment.issue ??
          this.args.model.issues.find(
            (issue) => Number(issue.id) === Number(assignment.issueId)
          ) ??
          null,
        key: `${assignment.userId}:${assignment.issueId}`,
      }));
  };

  memberAssignmentCount = (member: CapacityPlanningTeamMember): number => {
    return this.memberAssignments(member).length;
  };

  memberUserId = (member: CapacityPlanningTeamMember): number => {
    return Number(member.user.id);
  };

  memberDisplayName = (member: CapacityPlanningTeamMember): string => {
    return member.user.fullName || member.user.username;
  };

  memberAssignedHours = (member: CapacityPlanningTeamMember): number => {
    return this.memberAssignments(member).reduce(
      (sum, assignment) => sum + this.assignedHoursFor(member, assignment),
      0
    );
  };

  memberUtilizationPercent = (member: CapacityPlanningTeamMember): number => {
    const weeklyHours = this.weeklyHoursFor(member);

    if (weeklyHours <= 0) {
      return 0;
    }

    return Math.round((this.memberAssignedHours(member) / weeklyHours) * 100);
  };

  assignedHoursFor = (
    member: CapacityPlanningTeamMember,
    assignment: AssignmentCard
  ): number => {
    if (this.isNewMode) {
      return this.parseHours(
        this.draftAssignmentsByIssueId[assignment.issueId]?.assignedHours
      );
    }

    return this.parseHours(
      this.assignedHoursOverrides[
        `${Number(member.user.id)}:${Number(assignment.issueId)}`
      ]
    );
  };

  hoursInputValue = (value: number): string => {
    return String(value);
  };

  assignedHoursValue = (
    member: CapacityPlanningTeamMember,
    assignment: AssignmentCard
  ): string => {
    if (this.isNewMode) {
      return (
        this.draftAssignmentsByIssueId[assignment.issueId]?.assignedHours ?? '0'
      );
    }

    return (
      this.assignedHoursOverrides[
        `${Number(member.user.id)}:${Number(assignment.issueId)}`
      ] ?? String(assignment.assignedHours)
    );
  };

  utilizationStyle = (value: number): string => {
    return `width: ${value}%;`;
  };

  priorityClass = (priority: PriorityTone): string => {
    return `--${priority}`;
  };

  issuePriorityLabel = (issue: GithubIssueModel | null): PriorityTone => {
    return this.priorityTone(issue?.priority ?? null);
  };

  issueRepositoryName = (issue: GithubIssueModel | null): string => {
    if (!issue) {
      return 'repository';
    }

    return (
      issue.repository?.name ??
      this.args.model.repositories.find(
        (repository) => Number(repository.id) === Number(issue.repositoryId)
      )?.name ??
      'repository'
    );
  };

  issueNumber = (issue: GithubIssueModel | null): number => {
    return Number(issue?.githubIssueNumber ?? 0);
  };

  issueTitle = (issue: GithubIssueModel | null): string => {
    return issue?.title ?? 'Unknown issue';
  };

  issueEstimatedHours = (issue: GithubIssueModel | null): number | null => {
    return issue?.estimatedHours ?? null;
  };

  issueEstimationConfidence = (
    issue: GithubIssueModel | null
  ): 'low' | 'medium' | 'high' | null => {
    return issue?.estimationConfidence ?? null;
  };

  selectedIssueEstimateLabel = (issue: SelectedIssue): string => {
    if (!issue.estimatedHours) {
      return 'No AI estimate';
    }

    const confidenceLabel = issue.estimationConfidence
      ? ` · ${issue.estimationConfidence} confidence`
      : '';

    return `AI estimate: ${issue.estimatedHours}h${confidenceLabel}`;
  };

  assignmentEstimateLabel = (issue: GithubIssueModel | null): string | null => {
    if (!issue?.estimatedHours) {
      return null;
    }

    const confidenceLabel = issue.estimationConfidence
      ? ` · ${issue.estimationConfidence} confidence`
      : '';

    return `AI estimate: ${issue.estimatedHours}h${confidenceLabel}`;
  };

  issueCardClass = (issueId: number): string => {
    return `capacity-plan-editor__issue-card ${
      this.selectedIssueId === issueId ? '--selected' : ''
    } ${this.isNewMode ? '--interactive' : ''}`;
  };

  assignmentZoneClass = (member: CapacityPlanningTeamMember): string => {
    return `capacity-plan-editor__assignment-zone ${
      this.dropTargetUserId === Number(member.user.id) ? '--drag-over' : ''
    }`;
  };

  updateSelectionAfterAssignment(): void {
    const nextIssue = this.unassignedIssues[0];
    this.selectedIssueId = nextIssue?.id ?? null;
  }

  assignIssueToMember(issueId: number, userId: number): void {
    if (!this.isNewMode) {
      return;
    }

    this.draftAssignmentsByIssueId = {
      ...this.draftAssignmentsByIssueId,
      [issueId]: {
        userId,
        assignedHours:
          this.draftAssignmentsByIssueId[issueId]?.assignedHours ??
          String(this.issueById(issueId)?.estimatedHours ?? 0),
      },
    };

    this.updateSelectionAfterAssignment();
  }

  bestFitMemberForIssue(
    issue: SelectedIssue | GithubIssueModel | null
  ): CapacityPlanningTeamMember | null {
    if (!issue) {
      return null;
    }

    return (
      [...this.args.model.teamMembers].sort(
        (left, right) =>
          this.memberRemainingHours(right) - this.memberRemainingHours(left)
      )[0] ?? null
    );
  }

  memberRemainingHours(member: CapacityPlanningTeamMember): number {
    return this.weeklyHoursFor(member) - this.memberAssignedHours(member);
  }

  autoAssignIssues(): void {
    if (!this.isNewMode) {
      return;
    }

    const assignments = { ...this.draftAssignmentsByIssueId };
    const plannedHoursByUserId = new Map<number, number>();

    for (const member of this.args.model.teamMembers) {
      plannedHoursByUserId.set(Number(member.user.id), 0);
    }

    for (const assignment of Object.values(assignments)) {
      plannedHoursByUserId.set(
        assignment.userId,
        (plannedHoursByUserId.get(assignment.userId) ?? 0) +
          this.parseHours(assignment.assignedHours)
      );
    }

    for (const issue of this.unassignedIssues) {
      const bestFit = [...this.args.model.teamMembers].sort((left, right) => {
        const leftRemaining =
          this.weeklyHoursFor(left) -
          (plannedHoursByUserId.get(Number(left.user.id)) ?? 0);
        const rightRemaining =
          this.weeklyHoursFor(right) -
          (plannedHoursByUserId.get(Number(right.user.id)) ?? 0);

        return rightRemaining - leftRemaining;
      })[0];

      if (!bestFit) {
        continue;
      }

      const userId = Number(bestFit.user.id);
      const assignedHours = String(issue.estimatedHours ?? 1);

      assignments[issue.id] = {
        userId,
        assignedHours,
      };
      plannedHoursByUserId.set(
        userId,
        (plannedHoursByUserId.get(userId) ?? 0) + this.parseHours(assignedHours)
      );
    }

    this.draftAssignmentsByIssueId = assignments;
    this.updateSelectionAfterAssignment();
  }

  createPlanTask = task(async () => {
    if (!this.isNewMode || !this.canCreatePlan) {
      throw new Error('Please choose both a start date and an end date.');
    }

    const workspaceId = Number(this.args.model.workspace.id);
    const capacityPlan = this.store.createRecord('capacity-plan', {
      workspaceId,
      start: this.serializeDateValue(this.startDate),
      end: this.serializeDateValue(this.endDate),
    });
    const savedPlan = await this.store.saveRecord(capacityPlan);
    const capacityPlanId = Number(savedPlan.id);

    await Promise.all(
      this.args.model.teamMembers.map((member) =>
        this.store.saveRecord(
          this.store.createRecord('capacity-plan-entry', {
            capacityPlanId,
            userId: Number(member.user.id),
            capacityHours: this.weeklyHoursFor(member),
          })
        )
      )
    );

    await Promise.all(
      this.draftAssignments.map((assignment) =>
        this.store.saveRecord(
          this.store.createRecord('issue-assignment', {
            issueId: assignment.issueId,
            userId: assignment.userId,
            capacityPlanId,
            assignedHours: this.parseHours(
              this.draftAssignmentsByIssueId[assignment.issueId]?.assignedHours
            ),
          })
        )
      )
    );

    this.flashMessages.success?.(
      'The capacity plan was created successfully.',
      {
        title: 'Capacity plan created',
      }
    );

    this.router.transitionTo(
      'workspaces.edit.capacity-planning.edit',
      Number(this.args.model.workspace.id),
      {
        queryParams: {
          planId: savedPlan.id,
        },
      }
    );
  });

  @action selectIssue(issueId: number) {
    this.selectedIssueId = issueId;
  }

  @action updateStartDate(value: string) {
    this.startDate = value;
  }

  @action updateEndDate(value: string) {
    this.endDate = value;
  }

  @action updateNotes(value: string) {
    this.notes = value;
  }

  @action handleNotesInput(event: Event) {
    this.updateNotes((event.target as HTMLTextAreaElement).value);
  }

  @action updateWeeklyHours(memberId: number, value: string) {
    this.weeklyHoursOverrides = {
      ...this.weeklyHoursOverrides,
      [memberId]: value,
    };
  }

  @action updateAssignedHours(
    memberId: number,
    issueId: number,
    value: string
  ) {
    if (this.isNewMode) {
      const currentAssignment = this.draftAssignmentsByIssueId[issueId];

      if (!currentAssignment) {
        return;
      }

      this.draftAssignmentsByIssueId = {
        ...this.draftAssignmentsByIssueId,
        [issueId]: {
          ...currentAssignment,
          assignedHours: value,
        },
      };

      return;
    }

    this.assignedHoursOverrides = {
      ...this.assignedHoursOverrides,
      [`${memberId}:${issueId}`]: value,
    };
  }

  @action assignSelectedIssueToMember(memberId: number) {
    if (!this.selectedIssue) {
      return;
    }

    this.assignIssueToMember(this.selectedIssue.id, memberId);
  }

  @action assignSelectedIssueToBestFit() {
    if (!this.selectedIssue) {
      return;
    }

    const bestFit = this.bestFitMemberForIssue(this.selectedIssue);

    if (!bestFit) {
      return;
    }

    this.assignIssueToMember(this.selectedIssue.id, Number(bestFit.user.id));
  }

  @action handleAutoAssignIssues() {
    this.autoAssignIssues();
  }

  @action removeAssignment(issueId: number) {
    if (!this.isNewMode) {
      return;
    }

    const remainingAssignments = { ...this.draftAssignmentsByIssueId };
    delete remainingAssignments[issueId];
    this.draftAssignmentsByIssueId = remainingAssignments;

    if (!this.selectedIssueId) {
      this.selectedIssueId = issueId;
    }
  }

  @action handleIssueDragStart(issueId: number, event: Event) {
    if (!this.isNewMode) {
      return;
    }

    const dragEvent = event as DragEvent;

    this.draggedIssueId = issueId;
    dragEvent.dataTransfer?.setData('text/plain', String(issueId));

    if (dragEvent.dataTransfer) {
      dragEvent.dataTransfer.effectAllowed = 'move';
    }
  }

  @action handleIssueDragEnd() {
    this.draggedIssueId = null;
    this.dropTargetUserId = null;
  }

  @action handleAssignmentZoneDragEnter(userId: number) {
    if (!this.isNewMode || !this.draggedIssueId) {
      return;
    }

    this.dropTargetUserId = userId;
  }

  @action handleAssignmentZoneDragOver(event: Event) {
    if (!this.isNewMode) {
      return;
    }

    event.preventDefault();
  }

  @action handleAssignmentZoneDrop(userId: number, event: Event) {
    if (!this.isNewMode) {
      return;
    }

    event.preventDefault();

    const dragEvent = event as DragEvent;
    const issueId =
      this.draggedIssueId ??
      Number(dragEvent.dataTransfer?.getData('text/plain') ?? 0);

    if (!issueId) {
      return;
    }

    this.assignIssueToMember(issueId, userId);
    this.draggedIssueId = null;
    this.dropTargetUserId = null;
  }

  @action createPlan() {
    this.createPlanTask.perform().catch((error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : 'Capacity plan creation failed. Please try again.';

      this.flashMessages.danger(message, {
        title: 'Could not create capacity plan',
      });
    });
  }

  <template>
    <div
      class="route-workspaces-edit-capacity-planning-editor {{this.modeClass}}"
      ...attributes
    >
      {{#if this.createPlanTask.isRunning}}
        <UiLoadingSpinner @backdrop={{true}} />
      {{/if}}

      <div class="capacity-plan-editor__hero">
        <div class="capacity-plan-editor__hero-main layout-vertical --gap-sm">
          <LinkTo
            @route="workspaces.edit.capacity-planning.index"
            class="capacity-plan-editor__back"
          >
            <UiIcon @name="arrow-left" />
            <span>Back to Capacity Planning</span>
          </LinkTo>

          <div class="layout-vertical --gap-xs">
            <h1 class="margin-zero">{{this.pageTitle}}</h1>
            <p class="margin-zero color-secondary">{{this.pageSubtitle}}</p>
          </div>
        </div>

        <div class="capacity-plan-editor__hero-stats">
          <span class={{this.syncStatusClass}}>
            <UiIcon @name="brand-github" />
            {{this.syncStatusLabel}}
          </span>
          <div class="capacity-plan-editor__stat">
            <span class="capacity-plan-editor__stat-label">Total Capacity</span>
            <strong>{{this.totalCapacity}}h</strong>
          </div>
          <div class="capacity-plan-editor__stat">
            <span class="capacity-plan-editor__stat-label">Allocated</span>
            <strong>{{this.totalAllocated}}h</strong>
          </div>
          <div class="capacity-plan-editor__stat">
            <span class="capacity-plan-editor__stat-label">Utilization</span>
            <strong>{{this.utilizationPercent}}%</strong>
          </div>
        </div>
      </div>

      <div class="capacity-plan-editor__content layout-vertical --gap-lg">
        <UiContainer
          @bordered={{true}}
          class="capacity-plan-editor__period-card"
        >
          <:header>
            <div
              class="capacity-plan-editor__section-title layout-horizontal --gap-sm --space-between"
            >
              <div class="layout-horizontal --gap-sm">
                <UiIcon @name="calendar-event" />
                <h2 class="margin-zero">Plan setup</h2>
              </div>
              <span class="capacity-plan-editor__inline-metric">
                {{this.estimateCoverageLabel}}
              </span>
            </div>
          </:header>

          <:default>
            <div class="capacity-plan-editor__period-grid">
              <UiFormGroup @label="Start Date">
                <UiDatePicker
                  @value={{this.startDate}}
                  @placeholder="Select start date"
                  @disabled={{this.isEditMode}}
                  @onInput={{this.updateStartDate}}
                  @onChange={{this.updateStartDate}}
                />
              </UiFormGroup>

              <UiFormGroup @label="End Date">
                <UiDatePicker
                  @value={{this.endDate}}
                  @placeholder="Select end date"
                  @disabled={{this.isEditMode}}
                  @onInput={{this.updateEndDate}}
                  @onChange={{this.updateEndDate}}
                />
              </UiFormGroup>

              <div class="capacity-plan-editor__setup-summary">
                <span class="capacity-plan-editor__summary-label">Open estimate</span>
                <strong>{{this.unassignedEstimateTotal}}h</strong>
                <span class="font-color-text-secondary">
                  Remaining AI-estimated work after current draft assignments.
                </span>
              </div>
            </div>
          </:default>
        </UiContainer>

        <div class="capacity-plan-editor__main-grid">
          <UiContainer
            @bordered={{true}}
            class="capacity-plan-editor__issues-panel"
          >
            <:header>
              <div
                class="capacity-plan-editor__section-title layout-horizontal --gap-sm --space-between"
              >
                <div class="layout-horizontal --gap-sm">
                  <UiIcon @name="alert-circle" />
                  <h2 class="margin-zero">
                    Issue queue ({{this.unassignedIssues.length}})
                  </h2>
                </div>
                {{#if this.isNewMode}}
                  <button
                    type="button"
                    class="capacity-plan-editor__ghost-action"
                    {{on "click" this.handleAutoAssignIssues}}
                  >
                    Auto-fill
                  </button>
                {{/if}}
              </div>
            </:header>

            <:default>
              <div class="capacity-plan-editor__suggestion">
                <UiIcon @name="sparkles" />
                <span>{{this.selectedIssueSuggestion}}</span>
              </div>

              {{#if this.hasSelectedIssue}}
                <UiButton
                  class="capacity-plan-editor__assign-button"
                  @text="Assign to best fit"
                  @iconLeft="sparkles"
                  @onClick={{this.assignSelectedIssueToBestFit}}
                />
              {{/if}}

              {{#if this.unassignedIssues.length}}
                <div
                  class="capacity-plan-editor__issue-list layout-vertical --gap-md"
                >
                  {{#each this.unassignedIssues as |issue|}}
                    <button
                      type="button"
                      class={{this.issueCardClass issue.id}}
                      draggable={{this.isNewMode}}
                      {{on "click" (fn this.selectIssue issue.id)}}
                      {{on "dragstart" (fn this.handleIssueDragStart issue.id)}}
                      {{on "dragend" this.handleIssueDragEnd}}
                    >
                      <div class="layout-horizontal --gap-sm">
                        <UiIcon @name="alert-circle" />
                        <div class="layout-vertical --gap-xs">
                          <div
                            class="layout-horizontal --gap-sm --space-between"
                          >
                            <strong>#{{issue.number}}</strong>
                            <span class="capacity-plan-editor__estimate-pill">
                              {{if
                                issue.estimatedHours
                                issue.estimatedHours
                                0
                              }}h
                            </span>
                          </div>
                          <span>{{issue.title}}</span>
                          <div class="capacity-plan-editor__issue-meta">
                            <span>{{issue.area}}</span>
                            <span
                              class="capacity-plan-editor__priority
                                {{this.priorityClass issue.priority}}"
                            >
                              {{issue.priority}}
                            </span>
                          </div>
                          <span class="capacity-plan-editor__estimate">
                            {{this.selectedIssueEstimateLabel issue}}
                          </span>
                        </div>
                      </div>
                    </button>
                  {{/each}}
                </div>
              {{else}}
                <div class="capacity-plan-editor__empty-state">
                  <p class="margin-zero">All issues have been assigned.</p>
                </div>
              {{/if}}

            </:default>
          </UiContainer>

          <div class="capacity-plan-editor__members layout-vertical --gap-md">
            <div
              class="capacity-plan-editor__section-title layout-horizontal --gap-sm"
            >
              <UiIcon @name="users" />
              <h2 class="margin-zero">Team Members ({{@model.teamMembers.length}})</h2>
            </div>

            {{#each @model.teamMembers as |member|}}
              <UiContainer
                @bordered={{true}}
                class="capacity-plan-editor__member-card"
              >
                <div class="capacity-plan-editor__member-head">
                  <UiAvatar
                    @model={{hash
                      fullName=(or member.user.fullName member.user.username)
                      avatarUrl=member.user.avatarUrl
                      id=member.user.id
                    }}
                  />
                  <div class="layout-vertical --gap-xs">
                    <h3 class="margin-zero">
                      {{this.memberDisplayName member}}
                    </h3>
                    <span class="capacity-plan-editor__role-badge">
                      {{member.role}}
                    </span>
                  </div>
                </div>

                <UiFormGroup @label="Weekly work hours">
                  <UiInput
                    @value={{this.hoursInputValue (this.weeklyHoursFor member)}}
                    @disabled={{this.isEditMode}}
                    @onInput={{fn
                      this.updateWeeklyHours
                      (this.memberUserId member)
                    }}
                  />
                </UiFormGroup>

                <div class="capacity-plan-editor__utilization">
                  <div class="layout-horizontal --space-between --align-center">
                    <span>Capacity Utilization</span>
                    <strong>
                      {{this.memberAssignedHours member}}h /
                      {{this.weeklyHoursFor member}}h ({{this.memberUtilizationPercent
                        member
                      }}%)
                    </strong>
                  </div>
                  <div class="capacity-plan-editor__progress">
                    <div
                      class="capacity-plan-editor__progress-bar"
                      style={{this.utilizationStyle
                        (this.memberUtilizationPercent member)
                      }}
                    ></div>
                  </div>
                </div>

                {{#if this.hasSelectedIssue}}
                  <UiButton
                    class="capacity-plan-editor__assign-button"
                    @text={{this.assignButtonText}}
                    @iconLeft="plus"
                    @onClick={{fn
                      this.assignSelectedIssueToMember
                      (this.memberUserId member)
                    }}
                  />
                {{/if}}

                <div
                  class="layout-vertical --gap-sm
                    {{this.assignmentZoneClass member}}"
                  {{on
                    "dragenter"
                    (fn
                      this.handleAssignmentZoneDragEnter
                      (this.memberUserId member)
                    )
                  }}
                  {{on "dragover" this.handleAssignmentZoneDragOver}}
                  {{on
                    "drop"
                    (fn
                      this.handleAssignmentZoneDrop (this.memberUserId member)
                    )
                  }}
                >
                  <span class="capacity-plan-editor__subheading">
                    Assigned Issues ({{this.memberAssignmentCount member}})
                  </span>

                  {{#if (this.memberAssignmentCount member)}}
                    {{#each (this.memberAssignments member) as |assignment|}}
                      <div class="capacity-plan-editor__assignment-card">
                        {{#if this.isNewMode}}
                          <button
                            type="button"
                            class="capacity-plan-editor__remove"
                            {{on
                              "click"
                              (fn this.removeAssignment assignment.issueId)
                            }}
                          >
                            <UiIcon @name="x" />
                          </button>
                        {{/if}}

                        <div class="layout-horizontal --gap-sm">
                          <UiIcon @name="alert-circle" />
                          <div class="layout-vertical --gap-xs">
                            <strong>#{{this.issueNumber
                                assignment.issue
                              }}</strong>
                            <span>{{this.issueTitle assignment.issue}}</span>
                            <div class="capacity-plan-editor__issue-meta">
                              <span>{{this.issueRepositoryName
                                  assignment.issue
                                }}</span>
                              <span
                                class="capacity-plan-editor__priority
                                  {{this.priorityClass
                                    (this.issuePriorityLabel assignment.issue)
                                  }}"
                              >
                                {{this.issuePriorityLabel assignment.issue}}
                              </span>
                            </div>
                            {{#if
                              (this.assignmentEstimateLabel assignment.issue)
                            }}
                              <span class="capacity-plan-editor__estimate">
                                {{this.assignmentEstimateLabel
                                  assignment.issue
                                }}
                              </span>
                            {{/if}}
                          </div>
                        </div>

                        <div class="capacity-plan-editor__hours-row">
                          <span>Assigned hours:</span>
                          <UiInput
                            class="capacity-plan-editor__hours-input"
                            aria-label="Assigned hours"
                            @value={{this.assignedHoursValue member assignment}}
                            @disabled={{this.isEditMode}}
                            @onInput={{fn
                              this.updateAssignedHours
                              (this.memberUserId member)
                              assignment.issueId
                            }}
                          />
                          <span>h</span>
                        </div>
                      </div>
                    {{/each}}
                  {{else}}
                    <div class="capacity-plan-editor__empty-assignment">
                      <span>No issues assigned yet.</span>
                    </div>
                  {{/if}}
                </div>
              </UiContainer>
            {{/each}}
          </div>
        </div>

        <div class="capacity-plan-editor__footer">
          <UiButton
            @text={{this.submitLabel}}
            @disabled={{this.isSubmitDisabled}}
            @loading={{this.createPlanTask.isRunning}}
            @onClick={{this.createPlan}}
          />
          <LinkTo
            @route="workspaces.edit.capacity-planning.index"
            class="capacity-plan-editor__cancel"
          >
            Cancel
          </LinkTo>
        </div>
      </div>
    </div>
  </template>
}
