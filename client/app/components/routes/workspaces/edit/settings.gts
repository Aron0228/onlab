import Component from '@glimmer/component';
import { fn } from '@ember/helper';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';
import { inject as service } from '@ember/service';
import { eq, not, or } from 'ember-truth-helpers';
import UiAlert from 'client/components/ui/alert';
import UiAriaTabs from 'client/components/ui/aria-tabs';
import UiAvatar from 'client/components/ui/avatar';
import UiButton from 'client/components/ui/button';
import UiCheckbox from 'client/components/ui/checkbox';
import UiContainer from 'client/components/ui/container';
import UiDropdown from 'client/components/ui/dropdown';
import type { DropdownOption } from 'client/components/ui/dropdown';
import UiFormGroup from 'client/components/ui/form-group';
import UiIcon from 'client/components/ui/icon';
import UiIconButton from 'client/components/ui/icon-button';
import UiInput from 'client/components/ui/input';
import UiLoadingSpinner from 'client/components/ui/loading-spinner';
import type ExpertiseModel from 'client/models/expertise';
import type InvitationModel from 'client/models/invitation';
import type UserExpertiseAssocModel from 'client/models/user-expertise-assoc';
import type UserModel from 'client/models/user';
import type WorkspaceMemberModel from 'client/models/workspace-member';
import type WorkspaceModel from 'client/models/workspace';
import type {
  ApiServiceLike,
  FlashMessagesServiceLike,
} from 'client/types/services';
import { task } from 'ember-concurrency';
import { task as trackedTask } from 'reactiveweb/ember-concurrency';

type WorkspaceMemberCountResponse = {
  count: number;
};

type TeamRole = 'OWNER' | 'ADMIN' | 'MEMBER';

type TeamMemberCard = {
  id: string;
  user: UserModel;
  role: TeamRole;
  workspaceMember?: WorkspaceMemberModel;
};

type TeamMembersPage = {
  owner: UserModel | null;
  members: WorkspaceMemberModel[];
};

type ExpertiseByUserId = Record<number, ExpertiseModel[]>;
type RoleOption = { id: 'ADMIN' | 'MEMBER'; name: string };

type StoreLike = {
  createRecord(
    modelName: 'invitation',
    data: {
      email: string;
      workspaceId: number;
    }
  ): InvitationModel;
  createRecord(
    modelName: 'expertise',
    data: {
      name: string;
      description?: string | null;
      workspaceId: number;
    }
  ): ExpertiseModel;
  createRecord(
    modelName: 'user-expertise-assoc',
    data: {
      userId: number;
      expertiseId: number;
    }
  ): UserExpertiseAssocModel;
  saveRecord<T>(record: T): Promise<T>;
  query(
    modelName: 'workspace-member',
    query: Record<string, unknown>
  ): Promise<ArrayLike<WorkspaceMemberModel>>;
  query(
    modelName: 'expertise',
    query: Record<string, unknown>
  ): Promise<ArrayLike<ExpertiseModel>>;
  query(
    modelName: 'user-expertise-assoc',
    query: Record<string, unknown>
  ): Promise<ArrayLike<UserExpertiseAssocModel>>;
  findRecord(modelName: 'user', id: number): Promise<UserModel>;
};

type ApiWithFilesServiceLike = ApiServiceLike & {
  buildUrl(path: string, params?: Record<string, string>): URL;
  request<T = unknown>(
    path: string,
    options: {
      method: string;
      body?: FormData;
      params?: Record<string, string>;
    }
  ): Promise<T>;
};

type SessionServiceLike = {
  data: {
    authenticated?: {
      token?: string;
    };
  };
};

export interface RoutesWorkspacesEditSettingsSignature {
  Args: {
    model: WorkspaceModel;
  };
  Blocks: {
    default: [];
  };
  Element: null;
}

export default class RoutesWorkspacesEditSettings extends Component<RoutesWorkspacesEditSettingsSignature> {
  @service declare store: StoreLike;
  @service declare api: ApiWithFilesServiceLike;
  @service declare session: SessionServiceLike;
  @service declare flashMessages: FlashMessagesServiceLike;

  @tracked invitationEmail = '';
  @tracked workspaceNameDraft = this.args.model.name ?? '';
  @tracked selectedAvatarFile: File | null = null;
  @tracked issueSyncDraft = Boolean(this.args.model.issueSync);
  @tracked capacityPlanningSyncDraft = Boolean(
    this.args.model.capacityPlanningSync
  );
  @tracked prRiskPredictionSyncDraft = Boolean(
    this.args.model.prRiskPredictionSync
  );
  @tracked reviewerSuggestionSyncDraft = Boolean(
    this.args.model.reviewerSuggestionSync
  );
  @tracked currentPage = 1;
  @tracked totalMembers = 0;
  @tracked expertiseByUserId: ExpertiseByUserId = {};
  @tracked workspaceExpertises: ExpertiseModel[] = [];
  @tracked selectedExpertiseIdByUserId: Record<number, number | null> = {};
  @tracked expertisePanelUser: TeamMemberCard | null = null;
  @tracked isExpertiseCatalogOpen = false;
  @tracked expertiseName = '';
  @tracked expertiseDescription = '';
  @tracked expertisePanelError: string | null = null;
  @tracked roleUpdateInFlightId: string | null = null;
  @tracked memberRemovalInFlightId: string | null = null;
  @tracked removedWorkspaceMemberIds: number[] = [];

  readonly pageSize = 4;
  readonly memberRoleOptions: RoleOption[] = [
    { id: 'ADMIN', name: 'Admin' },
    { id: 'MEMBER', name: 'Member' },
  ];

  saveWorkspaceTask = task(async () => {
    const workspace = this.args.model;
    const previousState = {
      name: workspace.name,
      issueSync: workspace.issueSync,
      capacityPlanningSync: workspace.capacityPlanningSync,
      prRiskPredictionSync: workspace.prRiskPredictionSync,
      reviewerSuggestionSync: workspace.reviewerSuggestionSync,
      avatarUrl: workspace.avatarUrl,
    };

    workspace.name = this.workspaceNameDraft.trim();
    workspace.issueSync = this.issueSyncDraft;
    workspace.capacityPlanningSync = this.capacityPlanningSyncDraft;
    workspace.prRiskPredictionSync = this.prRiskPredictionSyncDraft;
    workspace.reviewerSuggestionSync = this.reviewerSuggestionSyncDraft;

    try {
      const savedWorkspace = await this.store.saveRecord(workspace);

      if (this.selectedAvatarFile) {
        const fileRecord = await this.uploadAvatar(
          Number(savedWorkspace.id),
          this.selectedAvatarFile
        );
        const previewUrl = this.api.buildUrl(`/files/${fileRecord.id}/preview`);

        savedWorkspace.avatarUrl = previewUrl.toString();
        await this.store.saveRecord(savedWorkspace);
      }

      this.workspaceNameDraft = savedWorkspace.name;
      this.issueSyncDraft = Boolean(savedWorkspace.issueSync);
      this.capacityPlanningSyncDraft = Boolean(
        savedWorkspace.capacityPlanningSync
      );
      this.prRiskPredictionSyncDraft = Boolean(
        savedWorkspace.prRiskPredictionSync
      );
      this.reviewerSuggestionSyncDraft = Boolean(
        savedWorkspace.reviewerSuggestionSync
      );
      this.selectedAvatarFile = null;

      this.flashMessages.success?.('Workspace settings saved successfully.', {
        title: 'Workspace updated',
      });
    } catch (error) {
      workspace.name = previousState.name;
      workspace.issueSync = previousState.issueSync;
      workspace.capacityPlanningSync = previousState.capacityPlanningSync;
      workspace.prRiskPredictionSync = previousState.prRiskPredictionSync;
      workspace.reviewerSuggestionSync = previousState.reviewerSuggestionSync;
      workspace.avatarUrl = previousState.avatarUrl;
      throw error;
    }
  });

  createInvitationTask = task(async () => {
    const email = this.invitationEmail.trim();
    const workspaceId = Number(this.args.model.id);

    if (!this.canSendInvitation || !workspaceId) {
      throw new Error('Please enter a valid e-mail address.');
    }

    const invitation = this.store.createRecord('invitation', {
      email,
      workspaceId,
    });

    await this.store.saveRecord(invitation);

    this.invitationEmail = '';

    this.flashMessages.success?.(`Invitation sent to ${email}.`, {
      title: 'Invitation sent',
    });
  });

  loadWorkspaceExpertisesTask = task(async (): Promise<void> => {
    const workspaceId = Number(this.args.model.id);

    if (!workspaceId) {
      this.workspaceExpertises = [];
      return;
    }

    const expertises = Array.from(
      await this.store.query('expertise', {
        filter: {
          where: { workspaceId },
          order: ['name ASC'],
        },
      })
    );

    this.workspaceExpertises = expertises;
  });

  fetchTeamMembersTask = task(async (): Promise<TeamMembersPage> => {
    const workspaceId = Number(this.args.model.id);

    if (!workspaceId) {
      this.totalMembers = 0;

      return {
        owner: null,
        members: [],
      };
    }

    const memberCountResponse =
      await this.api.request<WorkspaceMemberCountResponse>(
        '/workspaceMembers/count',
        {
          method: 'GET',
          params: {
            where: JSON.stringify({ workspaceId }),
          },
        }
      );

    this.totalMembers = memberCountResponse.count + 1;

    const pageStart = (this.currentPage - 1) * this.pageSize;
    const includesOwner = pageStart === 0;
    const memberLimit = Math.max(0, this.pageSize - (includesOwner ? 1 : 0));
    const memberSkip = includesOwner ? 0 : Math.max(0, pageStart - 1);

    const [owner, members] = await Promise.all([
      includesOwner
        ? this.store.findRecord('user', this.args.model.ownerId)
        : Promise.resolve(null),
      memberLimit > 0
        ? this.store.query('workspace-member', {
            filter: {
              where: {
                workspaceId,
              },
              include: ['user'],
              order: ['id ASC'],
              limit: memberLimit,
              skip: memberSkip,
            },
          })
        : Promise.resolve([]),
    ]);

    return {
      owner,
      members: Array.from(members),
    };
  });

  loadExpertiseForCurrentPageTask = task(async (): Promise<void> => {
    const workspaceId = Number(this.args.model.id);
    const userIds = this.teamMemberCards
      .map((member) => Number(member.user.id))
      .filter((value) => Number.isFinite(value) && value > 0);

    if (!workspaceId || userIds.length === 0) {
      this.expertiseByUserId = {};
      return;
    }

    const associations = Array.from(
      await this.store.query('user-expertise-assoc', {
        filter: {
          where: {
            userId: { inq: userIds },
          },
          include: ['expertise'],
          order: ['id ASC'],
        },
      })
    );

    const expertiseByUserId: ExpertiseByUserId = {};

    associations.forEach((association) => {
      const expertise = association.expertise;

      if (!expertise || expertise.workspaceId !== workspaceId) {
        return;
      }

      const userId = Number(association.userId);
      const existing = expertiseByUserId[userId] ?? [];

      if (existing.some((item) => item.id === expertise.id)) {
        return;
      }

      expertiseByUserId[userId] = [...existing, expertise];
    });

    this.expertiseByUserId = expertiseByUserId;
  });

  createExpertiseTask = task(async () => {
    const workspaceId = Number(this.args.model.id);
    const name = this.expertiseName.trim();
    const description = this.expertiseDescription.trim();

    if (!workspaceId || !name) {
      throw new Error('Please enter an expertise name.');
    }

    this.expertisePanelError = null;

    const existingExpertises = Array.from(
      await this.store.query('expertise', {
        filter: {
          where: {
            workspaceId,
            name,
          },
          limit: 1,
        },
      })
    );

    const expertise =
      existingExpertises[0] ??
      (await this.store.saveRecord(
        this.store.createRecord('expertise', {
          name,
          description: description || null,
          workspaceId,
        })
      ));

    this.mergeWorkspaceExpertise(expertise);

    this.expertiseName = '';
    this.expertiseDescription = '';

    this.flashMessages.success?.(`${expertise.name} is available to assign.`, {
      title: existingExpertises[0]
        ? 'Expertise already exists'
        : 'Expertise created',
    });
  });

  assignExpertiseTask = task(async (member: TeamMemberCard) => {
    const userId = Number(member.user.id);
    const expertiseId = this.selectedExpertiseIdByUserId[userId];
    const expertise = this.workspaceExpertises.find(
      (item) => Number(item.id) === expertiseId
    );

    if (!userId || !expertiseId || !expertise) {
      throw new Error('Choose an expertise to assign.');
    }

    const currentExpertises = this.expertiseForUser(userId);

    if (currentExpertises.some((item) => Number(item.id) === expertiseId)) {
      throw new Error(`${member.user.fullName} already has this expertise.`);
    }

    await this.store.saveRecord(
      this.store.createRecord('user-expertise-assoc', {
        userId,
        expertiseId,
      })
    );

    this.expertiseByUserId = {
      ...this.expertiseByUserId,
      [userId]: [...currentExpertises, expertise],
    };
    this.selectedExpertiseIdByUserId = {
      ...this.selectedExpertiseIdByUserId,
      [userId]: null,
    };

    this.flashMessages.success?.(
      `${expertise.name} assigned to ${member.user.fullName}.`,
      {
        title: 'Expertise assigned',
      }
    );
  });

  removeWorkspaceMemberTask = task(async (member: TeamMemberCard) => {
    const workspaceMemberId = Number(member.workspaceMember?.id);

    if (!workspaceMemberId || member.role === 'OWNER') {
      throw new Error('This member cannot be removed from the workspace.');
    }

    this.memberRemovalInFlightId = member.id;

    try {
      await this.api.request(`/workspaceMembers/${workspaceMemberId}`, {
        method: 'DELETE',
      });
    } finally {
      this.memberRemovalInFlightId = null;
    }

    this.removedWorkspaceMemberIds = [
      ...this.removedWorkspaceMemberIds,
      workspaceMemberId,
    ];
    this.totalMembers = Math.max(0, this.totalMembers - 1);

    const remainingExpertises = { ...this.expertiseByUserId };
    delete remainingExpertises[Number(member.user.id)];
    this.expertiseByUserId = remainingExpertises;

    this.flashMessages.success?.(
      `${member.user.fullName} was removed from the workspace.`,
      {
        title: 'Member removed',
      }
    );
  });

  updateMemberRoleTask = task(
    async (member: TeamMemberCard, option: DropdownOption | null) => {
      const roleOption = this.asRoleOption(option);

      if (!member.workspaceMember || !roleOption) {
        return;
      }

      this.roleUpdateInFlightId = member.id;
      member.workspaceMember.role = roleOption.id;

      try {
        await this.store.saveRecord(member.workspaceMember);
      } finally {
        this.roleUpdateInFlightId = null;
      }

      this.flashMessages.success?.(
        `${member.user.fullName}'s role was updated to ${roleOption.name}.`,
        {
          title: 'Role updated',
        }
      );
    }
  );

  lastTeamMembers = trackedTask(this, this.fetchTeamMembersTask, () => [
    this.args.model.id,
    this.args.model.ownerId,
    this.currentPage,
  ]);

  lastExpertiseLoad = trackedTask(
    this,
    this.loadExpertiseForCurrentPageTask,
    () => [
      this.args.model.id,
      this.currentPage,
      ...this.teamMemberCards.map((member) => member.id),
    ]
  );

  lastWorkspaceExpertises = trackedTask(
    this,
    this.loadWorkspaceExpertisesTask,
    () => [this.args.model.id]
  );

  get teamMembersPage(): TeamMembersPage {
    return (
      (this.lastTeamMembers.value as TeamMembersPage | undefined) ?? {
        owner: null,
        members: [],
      }
    );
  }

  get teamMemberCards(): TeamMemberCard[] {
    const cards: TeamMemberCard[] = [];

    if (this.teamMembersPage.owner) {
      cards.push({
        id: `owner-${this.teamMembersPage.owner.id}`,
        user: this.teamMembersPage.owner,
        role: 'OWNER',
      });
    }

    this.teamMembersPage.members.forEach((member) => {
      if (!member.user) {
        return;
      }

      if (this.removedWorkspaceMemberIds.includes(Number(member.id))) {
        return;
      }

      cards.push({
        id: `member-${member.id}`,
        user: member.user,
        role: member.role ?? 'MEMBER',
        workspaceMember: member,
      });
    });

    return cards;
  }

  get selectedUserExpertises(): ExpertiseModel[] {
    const userId = Number(this.expertisePanelUser?.user.id ?? 0);

    return this.expertiseForUser(userId);
  }

  get hasWorkspaceChanges(): boolean {
    return (
      this.workspaceNameDraft.trim() !== (this.args.model.name ?? '') ||
      this.issueSyncDraft !== Boolean(this.args.model.issueSync) ||
      this.capacityPlanningSyncDraft !==
        Boolean(this.args.model.capacityPlanningSync) ||
      this.prRiskPredictionSyncDraft !==
        Boolean(this.args.model.prRiskPredictionSync) ||
      this.reviewerSuggestionSyncDraft !==
        Boolean(this.args.model.reviewerSuggestionSync) ||
      Boolean(this.selectedAvatarFile)
    );
  }

  get isExpertisePanelOpen(): boolean {
    return this.isExpertiseCatalogOpen;
  }

  get canSendInvitation(): boolean {
    return this.isValidEmail(this.invitationEmail);
  }

  get canAddExpertise(): boolean {
    return this.expertiseName.trim().length > 0;
  }

  get expertiseOptions(): DropdownOption[] {
    return this.workspaceExpertises.map((expertise) => ({
      id: Number(expertise.id),
      name: expertise.name,
    }));
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.totalMembers / this.pageSize));
  }

  get paginationStart(): number {
    if (this.totalMembers === 0) {
      return 0;
    }

    return (this.currentPage - 1) * this.pageSize + 1;
  }

  get paginationEnd(): number {
    return Math.min(this.currentPage * this.pageSize, this.totalMembers);
  }

  roleLabel = (role: TeamRole): string => {
    switch (role) {
      case 'OWNER':
        return 'Workspace Owner';
      case 'ADMIN':
        return 'Admin';
      default:
        return 'Member';
    }
  };

  expertiseForUser = (userId: number): ExpertiseModel[] => {
    return this.expertiseByUserId[userId] ?? [];
  };

  selectedRoleOption = (member: TeamMemberCard): RoleOption | null => {
    if (member.role === 'OWNER') {
      return null;
    }

    return (
      this.memberRoleOptions.find((option) => option.id === member.role) ?? null
    );
  };

  selectedExpertiseOption = (member: TeamMemberCard): DropdownOption | null => {
    const userId = Number(member.user.id);
    const expertiseId = this.selectedExpertiseIdByUserId[userId];

    if (!expertiseId) {
      return null;
    }

    return (
      this.expertiseOptions.find(
        (option) => Number(option.id) === expertiseId
      ) ?? null
    );
  };

  canAssignExpertise = (member: TeamMemberCard): boolean => {
    const userId = Number(member.user.id);
    const expertiseId = this.selectedExpertiseIdByUserId[userId];

    return Boolean(userId && expertiseId);
  };

  canRemoveMember = (member: TeamMemberCard): boolean => {
    return member.role !== 'OWNER' && Boolean(member.workspaceMember);
  };

  asRoleOption = (option: DropdownOption | null): RoleOption | null => {
    if (option?.id === 'ADMIN' || option?.id === 'MEMBER') {
      return {
        id: option.id,
        name: option.name ?? (option.id === 'ADMIN' ? 'Admin' : 'Member'),
      };
    }

    return null;
  };

  userIdValue = (userId: string | number | null | undefined): number => {
    return Number(userId ?? 0);
  };

  isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  }

  mergeWorkspaceExpertise(expertise: ExpertiseModel): void {
    if (this.workspaceExpertises.some((item) => item.id === expertise.id)) {
      return;
    }

    this.workspaceExpertises = [...this.workspaceExpertises, expertise].sort(
      (a, b) => a.name.localeCompare(b.name)
    );
  }

  async uploadAvatar(workspaceId: number, file: File): Promise<{ id: number }> {
    const token = this.session.data.authenticated?.token;
    const params = {
      workspaceId: String(workspaceId),
      originalName: file.name,
      ...(token ? { token } : {}),
    };

    const formData = new FormData();
    formData.append('workspaceId', String(workspaceId));
    formData.append('originalName', file.name);
    formData.append('file', file);

    return this.api.request<{ id: number }>('/files/upload', {
      method: 'POST',
      body: formData,
      params,
    });
  }

  @action
  updateWorkspaceName(value: string): void {
    this.workspaceNameDraft = value;
  }

  @action
  onAvatarChanged(file: File): void {
    this.selectedAvatarFile = file;
  }

  @action
  updateIssueSync(checked: boolean): void {
    this.issueSyncDraft = checked;
  }

  @action
  updateCapacityPlanningSync(checked: boolean): void {
    this.capacityPlanningSyncDraft = checked;
  }

  @action
  updatePrRiskPredictionSync(checked: boolean): void {
    this.prRiskPredictionSyncDraft = checked;
  }

  @action
  updateReviewerSuggestionSync(checked: boolean): void {
    this.reviewerSuggestionSyncDraft = checked;
  }

  @action
  saveWorkspace(): void {
    this.saveWorkspaceTask.perform().catch((error: unknown) => {
      this.flashMessages.danger(
        error instanceof Error ? error.message : 'Failed to save workspace.',
        {
          title: 'Workspace update failed',
        }
      );
    });
  }

  @action
  updateInvitationEmail(value: string): void {
    this.invitationEmail = value;
  }

  @action
  updateExpertiseName(value: string): void {
    this.expertiseName = value;
    this.expertisePanelError = null;
  }

  @action
  updateExpertiseDescription(value: string): void {
    this.expertiseDescription = value;
    this.expertisePanelError = null;
  }

  @action
  sendInvitation(): void {
    this.createInvitationTask.perform().catch((error: unknown) => {
      this.flashMessages.danger(
        error instanceof Error ? error.message : 'Failed to send invitation.',
        {
          title: 'Invitation failed',
        }
      );
    });
  }

  @action
  addExpertise(): void {
    this.createExpertiseTask.perform().catch((error: unknown) => {
      this.expertisePanelError =
        error instanceof Error ? error.message : 'Failed to add expertise.';
    });
  }

  @action
  updateSelectedExpertise(
    member: TeamMemberCard,
    option: DropdownOption | null
  ): void {
    const userId = Number(member.user.id);

    this.selectedExpertiseIdByUserId = {
      ...this.selectedExpertiseIdByUserId,
      [userId]: option?.id ? Number(option.id) : null,
    };
    this.expertisePanelError = null;
  }

  @action
  assignExpertise(member: TeamMemberCard): void {
    this.assignExpertiseTask.perform(member).catch((error: unknown) => {
      this.expertisePanelError =
        error instanceof Error ? error.message : 'Failed to assign expertise.';
    });
  }

  @action
  removeWorkspaceMember(member: TeamMemberCard): void {
    this.removeWorkspaceMemberTask.perform(member).catch((error: unknown) => {
      this.flashMessages.danger(
        error instanceof Error ? error.message : 'Failed to remove member.',
        {
          title: 'Member removal failed',
        }
      );
    });
  }

  @action
  clearExpertisePanelError(): void {
    this.expertisePanelError = null;
  }

  @action
  goToPreviousPage(): void {
    this.currentPage = Math.max(1, this.currentPage - 1);
  }

  @action
  goToNextPage(): void {
    this.currentPage = Math.min(this.totalPages, this.currentPage + 1);
  }

  @action
  openExpertisePanel(member?: TeamMemberCard): void {
    this.expertisePanelUser = member ?? null;
    this.isExpertiseCatalogOpen = true;
    this.expertiseName = '';
    this.expertiseDescription = '';
    this.expertisePanelError = null;
  }

  @action
  openExpertiseCatalog(): void {
    this.openExpertisePanel();
  }

  @action
  closeExpertisePanel(): void {
    this.expertisePanelUser = null;
    this.isExpertiseCatalogOpen = false;
    this.expertiseName = '';
    this.expertiseDescription = '';
    this.expertisePanelError = null;
  }

  @action
  updateMemberRole(
    member: TeamMemberCard,
    option: DropdownOption | null
  ): void {
    this.updateMemberRoleTask
      .perform(member, option)
      .catch((error: unknown) => {
        this.flashMessages.danger(
          error instanceof Error ? error.message : 'Failed to update role.',
          {
            title: 'Role update failed',
          }
        );
      });
  }

  <template>
    <div class="route-workspaces-edit-settings">
      <div class="settings-main layout-vertical">
        <div class="settings-header">
          <div class="layout-vertical">
            <div class="layout-horizontal --gap-sm">
              <UiIcon @name="settings" @variant="primary" />
              <h2 class="margin-zero">Workspace Settings</h2>
            </div>
            <span class="font-color-text-secondary">
              Manage your workspace configuration and preferences
            </span>
          </div>
        </div>

        <div class="layout-vertical --padding-md --gap-md settings-content">
          <UiAriaTabs @defaultTab="general" as |registry|>
            <div
              class="settings-tabs"
              role="tablist"
              aria-label="Workspace settings"
            >
              <registry.Tab
                @tabId="general"
                @text="General"
                @iconName="building-skyscraper"
                @id="workspace-settings-tab-general"
                @controls="workspace-settings-panel-general"
              />
              <registry.Tab
                @tabId="ai"
                @text="AI Settings"
                @iconName="sparkles"
                @id="workspace-settings-tab-ai"
                @controls="workspace-settings-panel-ai"
              />
              <registry.Tab
                @tabId="members"
                @text="Team Members"
                @iconName="users"
                @id="workspace-settings-tab-members"
                @controls="workspace-settings-panel-members"
              />
            </div>

            {{#if (eq registry.activeTab "general")}}
              <UiContainer
                role="tabpanel"
                id="workspace-settings-panel-general"
                aria-labelledby="workspace-settings-tab-general"
              >
                <:header>
                  <div class="layout-horizontal --gap-sm">
                    <UiIcon @name="building-skyscraper" />
                    <h3 class="margin-zero">
                      General Workspace
                    </h3>
                  </div>
                </:header>

                <:default>
                  <div class="settings-general-grid">
                    <div class="settings-identity-card">
                      <UiAvatar
                        @model={{@model}}
                        @onChange={{this.onAvatarChanged}}
                        @squared={{true}}
                      />

                      <div class="layout-vertical --gap-sm --flex-grow">
                        <UiFormGroup
                          @label="Workspace Name"
                          @required={{true}}
                          @trailingText="This is shown in navigation, communication, and GitHub sync screens."
                        >
                          <UiInput
                            @value={{this.workspaceNameDraft}}
                            @onInput={{this.updateWorkspaceName}}
                            @placeholder="Workspace name"
                            type="text"
                            required
                          />
                        </UiFormGroup>
                      </div>
                    </div>

                    <div class="settings-actions-row">
                      <UiButton
                        @text="Save workspace"
                        @iconLeft="device-floppy"
                        @onClick={{this.saveWorkspace}}
                        @loading={{this.saveWorkspaceTask.isRunning}}
                        @disabled={{or
                          (not this.workspaceNameDraft)
                          (not this.hasWorkspaceChanges)
                        }}
                      />
                    </div>
                  </div>
                </:default>
              </UiContainer>
            {{else if (eq registry.activeTab "ai")}}
              <UiContainer
                role="tabpanel"
                id="workspace-settings-panel-ai"
                aria-labelledby="workspace-settings-tab-ai"
                class="settings-ai-panel"
              >
                <:header>
                  <div class="layout-horizontal --gap-sm">
                    <UiIcon @name="sparkles" @variant="accent" />
                    <h3 class="margin-zero">
                      AI Settings
                    </h3>
                  </div>
                </:header>

                <:default>
                  <div class="settings-ai-grid">
                    <div class="settings-ai-card">
                      <div class="settings-ai-card__control">
                        <UiCheckbox
                          @checked={{this.issueSyncDraft}}
                          @onChange={{this.updateIssueSync}}
                        />
                      </div>
                      <span class="settings-ai-card__content">
                        <strong>AI Issue Priorities</strong>
                        <span>
                          Let AI suggest priority levels for issues.
                        </span>
                      </span>
                    </div>

                    <div class="settings-ai-card">
                      <div class="settings-ai-card__control">
                        <UiCheckbox
                          @checked={{this.capacityPlanningSyncDraft}}
                          @onChange={{this.updateCapacityPlanningSync}}
                        />
                      </div>
                      <span class="settings-ai-card__content">
                        <strong>Capacity Planning Sync</strong>
                        <span>
                          Automatically assign issues based on capacity
                          planning.
                        </span>
                      </span>
                    </div>

                    <div class="settings-ai-card">
                      <div class="settings-ai-card__control">
                        <UiCheckbox
                          @checked={{this.reviewerSuggestionSyncDraft}}
                          @onChange={{this.updateReviewerSuggestionSync}}
                        />
                      </div>
                      <span class="settings-ai-card__content">
                        <strong>Reviewer Suggestion Sync</strong>
                        <span>
                          Sync AI-suggested reviewers to pull requests.
                        </span>
                      </span>
                    </div>

                    <div class="settings-ai-card">
                      <div class="settings-ai-card__control">
                        <UiCheckbox
                          @checked={{this.prRiskPredictionSyncDraft}}
                          @onChange={{this.updatePrRiskPredictionSync}}
                        />
                      </div>
                      <span class="settings-ai-card__content">
                        <strong>PR Prediction Sync</strong>
                        <span>
                          Use AI predictions for PR merge time and complexity.
                        </span>
                      </span>
                    </div>

                    <div class="settings-actions-row">
                      <UiButton
                        @text="Save AI settings"
                        @iconLeft="device-floppy"
                        @onClick={{this.saveWorkspace}}
                        @loading={{this.saveWorkspaceTask.isRunning}}
                        @disabled={{or
                          (not this.workspaceNameDraft)
                          (not this.hasWorkspaceChanges)
                        }}
                      />
                    </div>
                  </div>
                </:default>
              </UiContainer>
            {{else}}
              <div class="layout-vertical --gap-md">
                <UiContainer
                  @variant="primary"
                  @bordered={{true}}
                  class="layout-vertical --flex-grow"
                >
                  <:header>
                    <div class="layout-horizontal --gap-sm">
                      <UiIcon @name="mail" />
                      <h3 class="margin-zero">
                        Invite Members
                      </h3>
                    </div>
                  </:header>

                  <:default>
                    <div class="layout-vertical --gap-md">
                      <span class="font-color-text-muted">
                        You can invite new members to this workspace by their
                        e-mail address
                      </span>

                      <div
                        class="settings-invite-row layout-horizontal --gap-sm --flex-grow"
                      >
                        <UiInput
                          @value={{this.invitationEmail}}
                          @onInput={{this.updateInvitationEmail}}
                          @type="email"
                          @placeholder="colleague@company.com"
                          class="settings-invite-input"
                        />
                        <UiButton
                          @text="Send Invitation"
                          @onClick={{this.sendInvitation}}
                          @loading={{this.createInvitationTask.isRunning}}
                          @disabled={{not this.canSendInvitation}}
                        />
                      </div>
                    </div>
                  </:default>
                </UiContainer>
              </div>

              <UiContainer
                role="tabpanel"
                id="workspace-settings-panel-members"
                aria-labelledby="workspace-settings-tab-members"
              >
                <:header>
                  <div class="settings-members-header">
                    <div class="layout-horizontal --gap-sm">
                      <UiIcon @name="users" />
                      <h3 class="margin-zero">
                        Team Members
                      </h3>
                    </div>

                    <UiButton
                      @text="Manage expertise catalog"
                      @iconLeft="sparkles"
                      @onClick={{this.openExpertiseCatalog}}
                    />
                  </div>
                </:header>

                <:default>
                  <div class="layout-vertical --gap-md">
                    <div class="settings-members-summary">
                      <div class="layout-vertical">
                        <span class="font-weight-medium">
                          {{this.totalMembers}}
                          team member{{if (eq this.totalMembers 1) "" "s"}}
                        </span>
                        <span
                          class="font-color-text-secondary font-size-text-sm"
                        >
                          Showing
                          {{this.paginationStart}}-{{this.paginationEnd}}
                          of
                          {{this.totalMembers}}
                        </span>
                      </div>

                      <div class="layout-horizontal --gap-sm">
                        <UiButton
                          @text="Previous"
                          @hierarchy="secondary"
                          @onClick={{this.goToPreviousPage}}
                          @disabled={{eq this.currentPage 1}}
                        />
                        <UiButton
                          @text="Next"
                          @hierarchy="secondary"
                          @onClick={{this.goToNextPage}}
                          @disabled={{eq this.currentPage this.totalPages}}
                        />
                      </div>
                    </div>

                    {{#if
                      (or
                        (or
                          this.lastTeamMembers.isRunning
                          this.lastExpertiseLoad.isRunning
                        )
                        this.lastWorkspaceExpertises.isRunning
                      )
                    }}
                      <div class="settings-members-loading">
                        <UiLoadingSpinner />
                      </div>
                    {{else}}
                      <div
                        class="settings-members-list layout-vertical --gap-md"
                      >
                        {{#each this.teamMemberCards as |member|}}
                          <div class="settings-member-card">
                            <div class="settings-member-card__header">
                              <UiAvatar @model={{member.user}} @size="sm" />

                              <div class="settings-member-card__identity">
                                <div class="layout-horizontal --gap-sm">
                                  <h3 class="margin-zero">
                                    {{member.user.fullName}}
                                  </h3>
                                  <span
                                    class="settings-member-card__badge --role-{{member.role}}"
                                  >
                                    {{this.roleLabel member.role}}
                                  </span>
                                </div>

                                <span class="font-color-text-muted">
                                  {{member.user.email}}
                                </span>
                              </div>
                            </div>

                            <div
                              class="settings-member-card__details layout-vertical --gap-sm"
                            >
                              <div class="settings-member-card__section">
                                <span
                                  class="settings-member-card__label"
                                >Role</span>
                                {{#if (eq member.role "OWNER")}}
                                  <div class="settings-member-card__value">
                                    {{this.roleLabel member.role}}
                                  </div>
                                {{else}}
                                  <UiDropdown
                                    @options={{this.memberRoleOptions}}
                                    @selected={{this.selectedRoleOption member}}
                                    @onChange={{fn
                                      this.updateMemberRole
                                      member
                                    }}
                                    @disabled={{eq
                                      this.roleUpdateInFlightId
                                      member.id
                                    }}
                                    class="settings-member-card__dropdown"
                                  />
                                {{/if}}
                              </div>

                              <div class="settings-member-card__section">
                                <span class="settings-member-card__label">
                                  Expertise
                                </span>

                                <div class="settings-member-card__chips">
                                  {{#each
                                    (this.expertiseForUser
                                      (this.userIdValue member.user.id)
                                    )
                                    as |expertise|
                                  }}
                                    <span class="settings-expertise-chip">
                                      {{expertise.name}}
                                    </span>
                                  {{else}}
                                    <span
                                      class="font-color-text-secondary font-size-text-sm"
                                    >
                                      No expertise added yet.
                                    </span>
                                  {{/each}}
                                </div>

                                <div class="settings-expertise-assign">
                                  <UiDropdown
                                    @options={{this.expertiseOptions}}
                                    @selected={{this.selectedExpertiseOption
                                      member
                                    }}
                                    @onChange={{fn
                                      this.updateSelectedExpertise
                                      member
                                    }}
                                    @placeholder="Select workspace expertise"
                                    @allowClear={{true}}
                                    class="settings-expertise-assign__select"
                                  />
                                  <UiButton
                                    @text="Assign"
                                    @hierarchy="secondary"
                                    @onClick={{fn this.assignExpertise member}}
                                    @loading={{this.assignExpertiseTask.isRunning}}
                                    @disabled={{not
                                      (this.canAssignExpertise member)
                                    }}
                                  />
                                </div>
                              </div>

                              {{#if (this.canRemoveMember member)}}
                                <div class="settings-member-card__danger">
                                  <div class="layout-vertical --gap-xs">
                                    <span
                                      class="settings-member-card__label color-error"
                                    >
                                      Remove from workspace
                                    </span>
                                    <span
                                      class="font-color-text-secondary font-size-text-sm"
                                    >
                                      This removes their access to this
                                      workspace.
                                    </span>
                                  </div>
                                  <UiButton
                                    @text="Remove"
                                    @hierarchy="secondary"
                                    @iconLeft="trash"
                                    @onClick={{fn
                                      this.removeWorkspaceMember
                                      member
                                    }}
                                    @loading={{eq
                                      this.memberRemovalInFlightId
                                      member.id
                                    }}
                                  />
                                </div>
                              {{/if}}
                            </div>
                          </div>
                        {{else}}
                          <div class="settings-members-empty">
                            <UiIcon @name="users" />
                            <span class="font-color-text-secondary">
                              No team members found for this workspace yet.
                            </span>
                          </div>
                        {{/each}}
                      </div>
                    {{/if}}
                  </div>
                </:default>
              </UiContainer>
            {{/if}}
          </UiAriaTabs>
        </div>

      </div>

      {{#if this.isExpertisePanelOpen}}
        <aside class="settings-expertise-panel">
          <div class="settings-expertise-panel__header">
            <div class="layout-vertical --gap-xs">
              <div class="layout-horizontal --gap-sm">
                <UiIcon @name="sparkles" @variant="primary" />
                <h2 class="margin-zero">Expertise Catalog</h2>
              </div>
              <span class="font-color-text-secondary">
                {{#if this.expertisePanelUser}}
                  Assign reusable expertise to
                  {{this.expertisePanelUser.user.fullName}}
                {{else}}
                  Create reusable expertise for this workspace.
                {{/if}}
              </span>
            </div>

            <UiIconButton
              @iconName="x"
              @iconVariant="normal"
              @onClick={{this.closeExpertisePanel}}
            />
          </div>

          <div class="settings-expertise-panel__body layout-vertical --gap-lg">
            {{#if this.expertisePanelError}}
              <UiAlert
                @message={{this.expertisePanelError}}
                @type="alert"
                @onClose={{this.clearExpertisePanelError}}
              />
            {{/if}}

            <UiContainer
              @variant="primary"
              @bordered={{true}}
              class="settings-expertise-panel__info"
            >
              Create expertise once for this workspace, then assign it to any
              teammate from their card. This keeps reviewer suggestions and news
              feed targeting consistent.
            </UiContainer>

            <div class="layout-vertical --gap-md">
              <h3 class="margin-zero">Create catalog item</h3>
              <UiFormGroup @label="Expertise Name">
                <UiInput
                  @value={{this.expertiseName}}
                  @onInput={{this.updateExpertiseName}}
                  @placeholder="e.g., Backend Development, UI/UX Design"
                />
              </UiFormGroup>

              <UiFormGroup @label="Description">
                <UiInput
                  @value={{this.expertiseDescription}}
                  @onInput={{this.updateExpertiseDescription}}
                  @placeholder="What kind of work should this match?"
                />
              </UiFormGroup>

              <UiButton
                @text="Create expertise"
                @iconLeft="plus"
                @onClick={{this.addExpertise}}
                @loading={{this.createExpertiseTask.isRunning}}
                @disabled={{not this.canAddExpertise}}
              />
            </div>

            <div class="layout-vertical --gap-md">
              <h3 class="margin-zero">Workspace catalog</h3>
              <div class="settings-catalog-list">
                {{#each this.workspaceExpertises as |expertise|}}
                  <div class="settings-catalog-item">
                    <strong>{{expertise.name}}</strong>
                    {{#if expertise.description}}
                      <span>{{expertise.description}}</span>
                    {{else}}
                      <span>No description yet.</span>
                    {{/if}}
                  </div>
                {{else}}
                  <span class="font-color-text-secondary font-size-text-sm">
                    No workspace expertise catalog items yet.
                  </span>
                {{/each}}
              </div>
            </div>

            {{#if this.expertisePanelUser}}
              <div class="layout-vertical --gap-md">
                <h3 class="margin-zero">
                  {{this.expertisePanelUser.user.fullName}}'s expertise
                </h3>
                <div class="layout-horizontal --gap-sm --wrap">
                  <div class="settings-member-card__chips">
                    {{#each this.selectedUserExpertises as |expertise|}}
                      <span class="settings-expertise-chip --panel">
                        {{expertise.name}}
                      </span>
                    {{else}}
                      <span class="font-color-text-secondary font-size-text-sm">
                        No expertise added yet.
                      </span>
                    {{/each}}
                  </div>
                </div>
              </div>
            {{/if}}
          </div>

          <div class="settings-expertise-panel__footer">
            <UiButton
              @text="Done"
              @hierarchy="secondary"
              @onClick={{this.closeExpertisePanel}}
            />
          </div>
        </aside>
      {{/if}}
    </div>
  </template>
}
