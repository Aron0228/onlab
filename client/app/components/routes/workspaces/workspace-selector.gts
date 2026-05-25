import Component from '@glimmer/component';
import { action } from '@ember/object';
import { fn } from '@ember/helper';
import { registerDestructor } from '@ember/destroyable';
import { service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { or } from 'ember-truth-helpers';
import type Owner from '@ember/owner';
import type RouterService from '@ember/routing/router-service';
import UiAvatar from 'client/components/ui/avatar';
import UiIcon from 'client/components/ui/icon';
import UiLoadingSpinner from 'client/components/ui/loading-spinner';
import type WorkspaceModel from 'client/models/workspace';
import type WorkspaceMemberModel from 'client/models/workspace-member';
import type { ApiServiceLike } from 'client/types/services';
import type SessionService from 'ember-simple-auth/services/session';

type WorkspaceRole = 'MEMBER' | 'ADMIN' | 'OWNER';

type SessionAccountServiceLike = {
  id?: number;
};

type WorkspaceCountResponse = {
  count: number;
};

type StoreLike = {
  query(
    modelName: 'workspace',
    query: Record<string, unknown>
  ): Promise<WorkspaceModel[]>;
  query(
    modelName: 'workspace-member',
    query: Record<string, unknown>
  ): Promise<WorkspaceMemberModel[]>;
};

type SocketLike = {
  connected?: boolean;
  socket?: {
    connected?: boolean;
  };
  on(
    event: string,
    callback: (...args: unknown[]) => void,
    context?: unknown
  ): void;
  off(event: string, callback: (...args: unknown[]) => void): void;
  emit(
    event: string,
    payload: unknown,
    callback?: (response: unknown) => void
  ): void;
};

type SocketIoServiceLike = {
  socketFor(url: string, options?: Record<string, unknown>): SocketLike;
};

type PresenceRequestResponse = {
  onlineUserIds?: number[];
};

type PresenceSnapshotPayload = {
  onlineUserIds?: number[];
};

type PresenceUpdatePayload = {
  userId?: number;
  isOnline?: boolean;
};

type WorkspaceSelectorItem = {
  workspace: WorkspaceModel;
  role: WorkspaceRole;
  memberCount?: string;
};

export interface RoutesWorkspacesWorkspaceSelectorSignature {
  Args: {
    workspace: WorkspaceModel;
  };
  Blocks: {
    default: [];
  };
  Element: HTMLDivElement;
}

export default class RoutesWorkspacesWorkspaceSelector extends Component<RoutesWorkspacesWorkspaceSelectorSignature> {
  @service declare api: ApiServiceLike;
  @service declare router: RouterService;
  @service declare session: SessionService;
  @service declare sessionAccount: SessionAccountServiceLike;
  @service('socket-io') declare socketIOService: SocketIoServiceLike;
  @service declare store: StoreLike;

  @tracked isOpen = false;
  @tracked isLoading = false;
  @tracked workspaceItems: WorkspaceSelectorItem[] = [];
  @tracked errorMessage: string | null = null;
  @tracked currentWorkspaceRole: WorkspaceRole | null = null;
  @tracked currentWorkspaceUserIds: number[] = [];
  @tracked onlineUserIds: number[] = [];

  private socket?: SocketLike;

  constructor(
    owner: Owner,
    args: RoutesWorkspacesWorkspaceSelectorSignature['Args']
  ) {
    super(owner, args);

    document.addEventListener('click', this.closeOnOutsideClick);
    this.scheduleAfterRender(() => {
      void this.loadCurrentWorkspaceMeta();
      this.connectSocket();
    });
    registerDestructor(this, () => {
      document.removeEventListener('click', this.closeOnOutsideClick);
      this.socket?.off('connect', this.onSocketConnected);
      this.socket?.off('presence:snapshot', this.onPresenceSnapshot);
      this.socket?.off('presence:updated', this.onPresenceUpdated);
    });
  }

  private scheduleAfterRender(callback: FrameRequestCallback): void {
    const schedule =
      globalThis.requestAnimationFrame ??
      ((frameCallback: FrameRequestCallback) =>
        globalThis.setTimeout(frameCallback, 0));

    schedule(callback);
  }

  get currentWorkspace(): WorkspaceModel {
    return this.args.workspace;
  }

  get onlineMemberCount(): number {
    const workspaceUserIds = new Set(this.currentWorkspaceUserIds);

    return this.onlineUserIds.filter((userId) => workspaceUserIds.has(userId))
      .length;
  }

  get onlineMemberLabel(): string {
    return `${this.onlineMemberCount} online`;
  }

  get currentWorkspaceRoleLabel(): string {
    return this.currentWorkspaceRole ?? 'MEMBER';
  }

  get hasOtherWorkspaces(): boolean {
    return this.workspaceItems.some(
      (item) => Number(item.workspace.id) !== Number(this.currentWorkspace.id)
    );
  }

  get selectorItems(): WorkspaceSelectorItem[] {
    if (this.workspaceItems.length) {
      return this.workspaceItems;
    }

    return [
      {
        workspace: this.currentWorkspace,
        role: 'OWNER',
      },
    ];
  }

  isCurrentWorkspace = (workspace: WorkspaceModel): boolean => {
    return Number(workspace.id) === Number(this.currentWorkspace.id);
  };

  private closeOnOutsideClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null;

    if (!target?.closest('.workspace-selector')) {
      this.isOpen = false;
    }
  };

  private async loadWorkspaces(): Promise<void> {
    if (this.isLoading || this.workspaceItems.length) {
      return;
    }

    this.isLoading = true;
    this.errorMessage = null;

    try {
      const userId = this.sessionAccount.id;
      const ownedWorkspaces = await this.store.query('workspace', {
        filter: {
          where: {
            ownerId: userId,
          },
          order: ['name ASC'],
        },
      });
      const workspaceMembers = await this.store.query('workspace-member', {
        filter: {
          where: {
            userId,
          },
          include: ['workspace'],
        },
      });
      const itemsByWorkspaceId = new Map<number, WorkspaceSelectorItem>();

      ownedWorkspaces.forEach((workspace) => {
        itemsByWorkspaceId.set(Number(workspace.id), {
          workspace,
          role: 'OWNER',
        });
      });

      workspaceMembers.forEach((workspaceMember) => {
        const workspace = workspaceMember.workspace;
        const workspaceId = Number(workspace?.id);

        if (!workspace || !workspaceId || itemsByWorkspaceId.has(workspaceId)) {
          return;
        }

        itemsByWorkspaceId.set(workspaceId, {
          workspace,
          role: (workspaceMember.role as WorkspaceRole | undefined) ?? 'MEMBER',
        });
      });

      if (!itemsByWorkspaceId.has(Number(this.currentWorkspace.id))) {
        itemsByWorkspaceId.set(Number(this.currentWorkspace.id), {
          workspace: this.currentWorkspace,
          role: 'MEMBER',
        });
      }

      const items = Array.from(itemsByWorkspaceId.values()).sort((a, b) =>
        a.workspace.name.localeCompare(b.workspace.name)
      );

      await Promise.all(
        items.map(async (item) => {
          item.memberCount = await this.fetchWorkspaceMemberCount(
            Number(item.workspace.id)
          );
        })
      );

      this.workspaceItems = items;
    } catch {
      this.errorMessage = 'Workspaces could not be loaded.';
    } finally {
      this.isLoading = false;
    }
  }

  private async loadCurrentWorkspaceMeta(): Promise<void> {
    const workspaceId = Number(this.currentWorkspace.id);
    const currentUserId = Number(this.sessionAccount.id);

    if (!workspaceId) return;

    try {
      const workspaceMembers = await this.store.query('workspace-member', {
        filter: {
          where: {
            workspaceId,
          },
        },
      });
      const memberUserIds = workspaceMembers
        .map((member) => Number(member.userId))
        .filter((userId) => Number.isFinite(userId));

      this.currentWorkspaceUserIds = [
        ...new Set([Number(this.currentWorkspace.ownerId), ...memberUserIds]),
      ].filter((userId) => Number.isFinite(userId));

      if (Number(this.currentWorkspace.ownerId) === currentUserId) {
        this.currentWorkspaceRole = 'OWNER';
        return;
      }

      const currentMembership = workspaceMembers.find(
        (member) => Number(member.userId) === currentUserId
      );

      this.currentWorkspaceRole =
        (currentMembership?.role as WorkspaceRole | null) ?? 'MEMBER';
    } catch {
      this.currentWorkspaceUserIds = [
        Number(this.currentWorkspace.ownerId),
      ].filter((userId) => Number.isFinite(userId));
      this.currentWorkspaceRole =
        Number(this.currentWorkspace.ownerId) === currentUserId
          ? 'OWNER'
          : 'MEMBER';
    }
  }

  private async fetchWorkspaceMemberCount(
    workspaceId: number
  ): Promise<string> {
    const result = await this.api.request<WorkspaceCountResponse>(
      '/workspaceMembers/count',
      {
        method: 'GET',
        params: {
          where: JSON.stringify({ workspaceId }),
        },
      }
    );
    const count = result.count + 1;

    return `${count} member${count === 1 ? '' : 's'}`;
  }

  private connectSocket(): void {
    const token = this.session.data.authenticated?.token;
    if (!token || this.socket) return;

    const socket = this.socketIOService.socketFor(
      import.meta.env.VITE_API_URL as string,
      {
        query: { token },
      }
    );

    socket.on('connect', this.onSocketConnected, this);
    socket.on('presence:snapshot', this.onPresenceSnapshot, this);
    socket.on('presence:updated', this.onPresenceUpdated, this);
    this.socket = socket;

    if (socket.connected === true || socket.socket?.connected === true) {
      this.onSocketConnected();
    }
  }

  private onSocketConnected = (): void => {
    this.socket?.emit('presence:request', {}, (rawResponse) => {
      const response = rawResponse as PresenceRequestResponse;

      this.onPresenceSnapshot(response);
    });
  };

  private onPresenceSnapshot = (payload: unknown): void => {
    const snapshot = payload as PresenceSnapshotPayload;

    this.onlineUserIds = [...new Set(snapshot.onlineUserIds ?? [])].filter(
      (userId) => Number.isFinite(userId)
    );
  };

  private onPresenceUpdated = (payload: unknown): void => {
    const update = payload as PresenceUpdatePayload;
    const userId = Number(update.userId);

    if (!Number.isFinite(userId)) return;

    this.onlineUserIds = update.isOnline
      ? [...new Set([...this.onlineUserIds, userId])]
      : this.onlineUserIds.filter((onlineUserId) => onlineUserId !== userId);
  };

  @action
  toggleSelector(event: Event): void {
    event.stopPropagation();
    this.isOpen = !this.isOpen;

    if (this.isOpen) {
      void this.loadWorkspaces();
    }
  }

  @action
  selectWorkspace(workspace: WorkspaceModel): void {
    this.isOpen = false;

    if (this.isCurrentWorkspace(workspace)) {
      return;
    }

    void this.router.transitionTo(
      'workspaces.edit.news-feed',
      Number(workspace.id)
    );
  }

  @action
  createWorkspace(): void {
    this.isOpen = false;
    void this.router.transitionTo('workspaces.new');
  }

  <template>
    <div class="workspace-selector" ...attributes>
      <button
        type="button"
        class="workspace-selector__trigger"
        aria-haspopup="menu"
        aria-expanded={{if this.isOpen "true" "false"}}
        {{on "click" this.toggleSelector}}
      >
        <UiAvatar
          @model={{this.currentWorkspace}}
          @squared={{true}}
          @size="sm"
        />
        <span class="workspace-selector__trigger-copy">
          <span class="workspace-selector__trigger-title margin-zero">
            {{this.currentWorkspace.name}}
          </span>
          <small class="workspace-selector__trigger-meta">
            <span
              class="workspace-selector__online-dot"
              aria-hidden="true"
            ></span>
            <span>{{this.onlineMemberLabel}}</span>
            <span aria-hidden="true">·</span>
            <span>{{this.currentWorkspaceRoleLabel}}</span>
          </small>
        </span>
      </button>

      {{#if this.isOpen}}
        <div class="workspace-selector__menu" role="menu">
          <div class="workspace-selector__menu-header">
            <span>Switch workspace</span>
          </div>

          {{#if this.isLoading}}
            <div class="workspace-selector__loading">
              <UiLoadingSpinner />
            </div>
          {{else if this.errorMessage}}
            <p class="workspace-selector__empty margin-zero">
              {{this.errorMessage}}
            </p>
          {{else}}
            <div class="workspace-selector__list" role="group">
              {{#each this.selectorItems as |item|}}
                <button
                  type="button"
                  class="workspace-selector__item
                    {{if (this.isCurrentWorkspace item.workspace) '--active'}}"
                  role="menuitem"
                  {{on "click" (fn this.selectWorkspace item.workspace)}}
                >
                  <UiAvatar
                    @model={{item.workspace}}
                    @squared={{true}}
                    @size="sm"
                  />
                  <span class="workspace-selector__item-copy">
                    <strong>{{item.workspace.name}}</strong>
                    <small>
                      {{or item.memberCount "..."}}
                      ·
                      {{item.role}}
                    </small>
                  </span>
                  {{#if (this.isCurrentWorkspace item.workspace)}}
                    <UiIcon @name="circle-check" @variant="primary" />
                  {{/if}}
                </button>
              {{/each}}
            </div>

            {{#unless this.hasOtherWorkspaces}}
              <p class="workspace-selector__empty margin-zero">
                This is your only workspace for now.
              </p>
            {{/unless}}
          {{/if}}

          <button
            type="button"
            class="workspace-selector__create"
            role="menuitem"
            {{on "click" this.createWorkspace}}
          >
            <span class="workspace-selector__create-icon">
              <UiIcon @name="plus" />
            </span>
            <span class="workspace-selector__item-copy">
              <strong>Create workspace</strong>
              <small>Start a new team space</small>
            </span>
          </button>
        </div>
      {{/if}}
    </div>
  </template>
}
