import Component from '@glimmer/component';
import UiIconButton from 'client/components/ui/icon-button';
import UiAvatar from 'client/components/ui/avatar';
import UiIcon from 'client/components/ui/icon';
import UiButton from 'client/components/ui/button';
import UiCheckbox from 'client/components/ui/checkbox';
import UiInput from 'client/components/ui/input';
import RoutesWorkspacesHeaderActions from 'client/components/routes/workspaces/header-actions';
import { LinkTo } from '@ember/routing';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { action } from '@ember/object';
import { service } from '@ember/service';
import type RouterService from '@ember/routing/router-service';
import { tracked } from '@glimmer/tracking';
import { eq, not } from 'ember-truth-helpers';
import type WorkspaceModel from 'client/models/workspace';
import type GithubRepositoryModel from 'client/models/github-repository';
import type WorkspaceMemberModel from 'client/models/workspace-member';
import type UserModel from 'client/models/user';
import type ApiService from 'client/services/api';
import type SessionAccountService from 'client/services/session-account';
import type SessionService from 'ember-simple-auth/services/session';
import type {
  CommunicationChannel,
  CommunicationMember,
  CommunicationMessage,
} from 'client/routes/workspaces/edit/communication';
import type Owner from '@ember/owner';

type WorkspacesEditModel = {
  workspace: WorkspaceModel;
  repositories: GithubRepositoryModel[];
};

type MenuLinkItem = {
  separator: false;
  iconName: string;
  name: string;
  route: string;
  query?: Record<string, unknown>;
};

type MenuSeparatorItem = {
  separator: true;
};

type MenuItem = MenuLinkItem | MenuSeparatorItem;

const SEPARATOR = {
  separator: true,
} as const;

type SocketLike = {
  on(
    event: string,
    callback: (...args: unknown[]) => void,
    context?: unknown
  ): void;
  off(event: string, callback: (...args: unknown[]) => void): void;
};

type SocketIoServiceLike = {
  socketFor(url: string, options?: Record<string, unknown>): SocketLike;
};

export interface RoutesWorkspacesEditSignature {
  // The arguments accepted by the component
  Args: {
    model: WorkspacesEditModel;
  };
  // Any blocks yielded by the component
  Blocks: {
    default: [];
  };
  // The element to which `...attributes` is applied in the component template
  Element: null;
}

export default class RoutesWorkspacesEdit extends Component<RoutesWorkspacesEditSignature> {
  @service declare api: ApiService;
  @service declare router: RouterService;
  @service declare session: SessionService;
  @service declare sessionAccount: SessionAccountService;
  @service declare store: StoreLike;
  @service('socket-io') declare socketIOService: SocketIoServiceLike;

  @tracked isCollapsed = false;
  @tracked communicationChannels: CommunicationChannel[] = [];
  @tracked communicationMembers: CommunicationMember[] = [];
  @tracked selectedCommunicationChannelId = this.channelIdFromUrl;
  @tracked unreadCounts: Record<number, number> = {};
  @tracked isCreateChannelOpen = false;
  @tracked newChannelName = '';
  @tracked newChannelMemberIds: number[] = [];
  @tracked isCreatingChannel = false;
  @tracked channelErrorMessage: string | null = null;

  private socket?: SocketLike;
  private notificationAudioContext?: AudioContext;
  private hasEnabledNotificationSound = false;

  constructor(owner: Owner, args: RoutesWorkspacesEditSignature['Args']) {
    super(owner, args);

    if (globalThis.matchMedia?.('(max-width: 768px)').matches) {
      this.isCollapsed = true;
    }

    const scheduleLoad =
      globalThis.requestAnimationFrame ??
      ((callback: FrameRequestCallback) => globalThis.setTimeout(callback, 0));

    scheduleLoad(() => {
      void this.loadCommunicationMenu();
    });
    globalThis.addEventListener?.('pointerdown', this.enableNotificationSound, {
      once: true,
    });
    globalThis.addEventListener?.(
      'communication:channel-read',
      this.onChannelRead
    );
    globalThis.addEventListener?.(
      'communication:channel-muted',
      this.onChannelMuted
    );
  }

  willDestroy(): void {
    super.willDestroy();
    this.socket?.off('channel:updated', this.onChannelUpdated);
    globalThis.removeEventListener?.(
      'pointerdown',
      this.enableNotificationSound
    );
    globalThis.removeEventListener?.(
      'communication:channel-read',
      this.onChannelRead
    );
    globalThis.removeEventListener?.(
      'communication:channel-muted',
      this.onChannelMuted
    );
  }

  get bodyClass() {
    return `body${this.isCollapsed ? ' --collapsed' : ''}`;
  }

  get menuItems(): MenuItem[] {
    return [
      {
        separator: false,
        iconName: 'sparkles',
        name: 'News Feed',
        route: 'workspaces.edit.news-feed',
      },
      {
        separator: false,
        iconName: 'message-circle',
        name: 'Direct Messages',
        route: 'workspaces.edit.communication',
        query: { channelId: null },
      },
      SEPARATOR,
      {
        separator: false,
        iconName: 'exclamation-circle',
        name: 'Issues',
        route: 'workspaces.edit.issues',
      },
      {
        separator: false,
        iconName: 'git-pull-request',
        name: 'Pull Requests',
        route: 'workspaces.edit.pull-requests',
      },
      {
        separator: false,
        iconName: 'calendar-event',
        name: 'Capacity Planning',
        route: 'workspaces.edit.capacity-planning',
      },
      SEPARATOR,
      {
        separator: false,
        iconName: 'settings',
        name: 'Settings',
        route: 'workspaces.edit.settings',
      },
    ];
  }

  routeForMenuItem(menuItem: MenuItem): string {
    return menuItem.separator ? '' : menuItem.route;
  }

  iconForMenuItem(menuItem: MenuItem): string {
    return menuItem.separator ? '' : menuItem.iconName;
  }

  labelForMenuItem(menuItem: MenuItem): string {
    return menuItem.separator ? '' : menuItem.name;
  }

  queryForMenuItem(menuItem: MenuItem): Record<string, unknown> {
    return menuItem.separator ? {} : (menuItem.query ?? {});
  }

  get groupChannels(): CommunicationChannel[] {
    return this.communicationChannels.filter(
      (channel) => channel.type === 'GROUP'
    );
  }

  get canCreateChannel(): boolean {
    return this.newChannelName.trim().length > 0 && !this.isCreatingChannel;
  }

  get directUnreadCount(): number {
    return this.communicationChannels
      .filter((channel) => channel.type === 'DIRECT')
      .reduce((total, channel) => total + this.unreadCountFor(channel.id), 0);
  }

  onCollapseIconClick = () => {
    this.isCollapsed = !this.isCollapsed;
  };

  onNavItemClick = () => {
    this.isCollapsed = true;
    this.selectedCommunicationChannelId = null;
  };

  @action openCreateChannelModal(): void {
    this.channelErrorMessage = null;
    this.isCreateChannelOpen = true;
  }

  @action closeCreateChannelModal(): void {
    if (this.isCreatingChannel) return;

    this.isCreateChannelOpen = false;
    this.newChannelName = '';
    this.newChannelMemberIds = [];
    this.channelErrorMessage = null;
  }

  @action updateNewChannelName(value: string): void {
    this.newChannelName = value;
  }

  @action toggleNewChannelMember(
    member: CommunicationMember,
    checked: boolean
  ): void {
    this.newChannelMemberIds = checked
      ? [...new Set([...this.newChannelMemberIds, member.userId])]
      : this.newChannelMemberIds.filter((userId) => userId !== member.userId);
  }

  @action async createChannel(): Promise<void> {
    if (!this.canCreateChannel) return;

    this.isCreatingChannel = true;
    this.channelErrorMessage = null;

    try {
      const payload = await this.api.request(
        `/communication/workspaces/${Number(
          this.args.model.workspace.id
        )}/channels`,
        {
          method: 'POST',
          body: {
            name: this.newChannelName.trim(),
            memberIds: this.newChannelMemberIds,
          },
        }
      );
      const channel = parseChannel(payload);

      this.communicationChannels = [
        channel,
        ...this.communicationChannels.filter((item) => item.id !== channel.id),
      ];
      this.isCreateChannelOpen = false;
      this.newChannelName = '';
      this.newChannelMemberIds = [];
      this.openChannel(channel);
    } catch (error) {
      this.channelErrorMessage =
        error instanceof Error ? error.message : 'Channel creation failed.';
    } finally {
      this.isCreatingChannel = false;
    }
  }

  @action openChannel(channel: CommunicationChannel): void {
    this.selectedCommunicationChannelId = channel.id;
    this.markChannelRead(channel.id);
    this.isCollapsed = true;
    void this.router.transitionTo('workspaces.edit.communication', {
      queryParams: { channelId: channel.id },
    });
  }

  unreadCountFor = (channelId: number): number => {
    return this.unreadCounts[channelId] ?? 0;
  };

  unreadLabel = (count: number): string => {
    return count > 99 ? '99+' : String(count);
  };

  isNewChannelMemberSelected = (member: CommunicationMember): boolean => {
    return this.newChannelMemberIds.includes(member.userId);
  };

  private get channelIdFromUrl(): number | null {
    const channelId = globalThis.location
      ? new URLSearchParams(globalThis.location.search).get('channelId')
      : null;

    return channelId ? Number(channelId) : null;
  }

  private loadCommunicationMenu = async (): Promise<void> => {
    const workspace = this.args.model.workspace;
    const workspaceId = Number(workspace.id);

    try {
      const [members, owner, channelsPayload] = await Promise.all([
        this.store.query('workspace-member', {
          filter: {
            where: { workspaceId },
            include: ['user'],
            order: ['id ASC'],
          },
        }),
        this.store.findRecord('user', workspace.ownerId),
        this.api.request(`/communication/workspaces/${workspaceId}/channels`),
      ]);

      const memberList = Array.from(members)
        .filter((member) => member.user)
        .map((member) => ({
          id: Number(member.id),
          userId: Number(member.userId),
          fullName: member.user?.fullName ?? 'Unknown user',
          username: member.user?.username ?? '',
          avatarUrl: member.user?.avatarUrl,
        }));
      const memberIds = new Set(memberList.map((member) => member.userId));

      if (!memberIds.has(Number(owner.id))) {
        memberList.unshift({
          id: Number(owner.id),
          userId: Number(owner.id),
          fullName: owner.fullName,
          username: owner.username,
          avatarUrl: owner.avatarUrl,
        });
      }

      this.communicationMembers = memberList;
      this.communicationChannels = parseChannels(channelsPayload);
      this.selectedCommunicationChannelId = this.channelIdFromUrl;
      this.connectSocket();
    } catch {
      this.communicationMembers = [];
      this.communicationChannels = [];
    }
  };

  private connectSocket(): void {
    const token = this.session.data.authenticated?.token;
    if (!token || this.socket) return;

    const socket = this.socketIOService.socketFor(
      import.meta.env.VITE_API_URL as string,
      { query: { token } }
    );

    socket.on('channel:updated', this.onChannelUpdated, this);
    this.socket = socket;
  }

  private onChannelUpdated = (payload: unknown): void => {
    const update = payload as {
      channelId: number;
      message?: CommunicationMessage;
    };

    this.communicationChannels = this.communicationChannels.map((channel) =>
      channel.id === update.channelId
        ? {
            ...channel,
            messages: update.message
              ? [
                  ...channel.messages.filter(
                    (message) => message.id !== update.message?.id
                  ),
                  update.message,
                ]
              : channel.messages,
            updatedAt: update.message?.createdAt ?? channel.updatedAt,
          }
        : channel
    );

    if (
      update.channelId === this.selectedCommunicationChannelId ||
      update.message?.senderId === Number(this.sessionAccount.id)
    ) {
      return;
    }

    this.unreadCounts = {
      ...this.unreadCounts,
      [update.channelId]: (this.unreadCounts[update.channelId] ?? 0) + 1,
    };

    if (!this.isChannelMuted(update.channelId)) {
      void this.playNotificationSound();
    }
  };

  private markChannelRead(channelId: number): void {
    if (!this.unreadCounts[channelId]) return;

    const unreadCounts = { ...this.unreadCounts };
    delete unreadCounts[channelId];
    this.unreadCounts = unreadCounts;
  }

  private onChannelRead = (event: Event): void => {
    const channelId = (event as CustomEvent<{ channelId?: number }>).detail
      ?.channelId;

    if (channelId) {
      this.selectedCommunicationChannelId = channelId;
      this.markChannelRead(channelId);
    }
  };

  private onChannelMuted = (event: Event): void => {
    const detail = (
      event as CustomEvent<{
        channel?: CommunicationChannel | null;
        channelId?: number;
        mutedAt?: string | null;
      }>
    ).detail;
    const channelId = detail?.channelId;

    if (!channelId) return;

    if (
      !this.communicationChannels.some((channel) => channel.id === channelId) &&
      detail.channel
    ) {
      this.communicationChannels = [
        detail.channel,
        ...this.communicationChannels,
      ];
      return;
    }

    this.communicationChannels = this.communicationChannels.map((channel) =>
      channel.id === channelId
        ? {
            ...channel,
            members: channel.members.map((member) =>
              member.userId === Number(this.sessionAccount.id)
                ? { ...member, mutedAt: detail.mutedAt ?? null }
                : member
            ),
          }
        : channel
    );
  };

  private isChannelMuted(channelId: number): boolean {
    const channel = this.communicationChannels.find(
      (item) => item.id === channelId
    );
    const currentMembership = channel?.members.find(
      (member) => member.userId === Number(this.sessionAccount.id)
    );

    return Boolean(currentMembership?.mutedAt);
  }

  private enableNotificationSound = (): void => {
    this.hasEnabledNotificationSound = true;

    const context = this.getNotificationAudioContext();
    if (!context) return;

    void context.resume();
    this.playNotificationTone(context, 0.0001);
  };

  private async playNotificationSound(): Promise<void> {
    if (!this.hasEnabledNotificationSound) return;

    const context = this.getNotificationAudioContext();
    if (!context) return;

    try {
      if (context.state === 'suspended') {
        await context.resume();
      }

      this.playNotificationTone(context, 0.08);
    } catch {
      this.hasEnabledNotificationSound = false;
    }
  }

  private getNotificationAudioContext(): AudioContext | null {
    const windowWithAudio = globalThis as typeof globalThis & {
      webkitAudioContext?: typeof AudioContext;
    };
    const AudioContextConstructor =
      windowWithAudio.AudioContext ?? windowWithAudio.webkitAudioContext;
    if (!AudioContextConstructor) return null;

    try {
      const context =
        this.notificationAudioContext ?? new AudioContextConstructor();
      this.notificationAudioContext = context;
      return context;
    } catch {
      return null;
    }
  }

  private playNotificationTone(context: AudioContext, volume: number): void {
    try {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const startTime = context.currentTime;

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(740, startTime);
      oscillator.frequency.exponentialRampToValueAtTime(980, startTime + 0.08);
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.18);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startTime);
      oscillator.stop(startTime + 0.2);
    } catch {
      this.hasEnabledNotificationSound = false;
    }
  }

  <template>
    <div class="layout-vertical --max-height route-workspaces-edit">
      <div class={{this.bodyClass}}>
        <div class="workspace-summary layout-horizontal --gap-md">
          <div class="workspace-summary__identity layout-horizontal --gap-md">
            <UiAvatar
              @model={{@model.workspace}}
              @squared={{true}}
              @size="sm"
            />

            <div class="workspace-summary__content layout-vertical --gap-sm">
              <h3 class="margin-zero">{{@model.workspace.name}}</h3>
            </div>
          </div>

          <UiIconButton
            class="mobile-nav-collapse"
            @iconName="x"
            @onClick={{this.onCollapseIconClick}}
            aria-label="Close navigation"
          />
        </div>

        <div class="workspace-header-panel">
          {{#if this.isCollapsed}}
            <UiIconButton
              class="mobile-nav-toggle"
              @iconName="menu"
              @onClick={{this.onCollapseIconClick}}
              aria-label="Open navigation"
            />
          {{/if}}
          <div
            class="workspace-header-panel__workspace layout-horizontal --gap-md"
          >
            <RoutesWorkspacesHeaderActions />
          </div>
        </div>

        <div class="workspace-nav layout-vertical --gap-sm">
          {{#each this.menuItems as |menuItem|}}
            {{#if menuItem.separator}}
              <hr class="separator --horizontal --menu" />
            {{else}}
              <LinkTo
                @route={{this.routeForMenuItem menuItem}}
                @query={{this.queryForMenuItem menuItem}}
                class="nav-item layout-horizontal --gap-sm"
                {{on "click" this.onNavItemClick}}
              >
                <UiIcon @name={{this.iconForMenuItem menuItem}} />
                <span>{{this.labelForMenuItem menuItem}}</span>
                {{#if (eq (this.labelForMenuItem menuItem) "Direct Messages")}}
                  {{#if this.directUnreadCount}}
                    <span class="workspace-unread-badge margin-left-auto">
                      {{this.unreadLabel this.directUnreadCount}}
                    </span>
                  {{/if}}
                {{/if}}
              </LinkTo>
            {{/if}}
          {{/each}}

          <div class="workspace-channel-section layout-vertical --gap-xs">
            <div class="workspace-channel-section__heading">
              <span>Channels</span>
              <UiIconButton
                class="workspace-channel-section__add"
                @iconName="plus"
                @onClick={{this.openCreateChannelModal}}
                aria-label="Create channel"
              />
            </div>

            {{#each this.groupChannels as |channel|}}
              <button
                type="button"
                class="workspace-channel-item layout-horizontal --gap-sm
                  {{if
                    (eq channel.id this.selectedCommunicationChannelId)
                    '--active'
                  }}"
                {{on "click" (fn this.openChannel channel)}}
              >
                <UiIcon @name="hash" @size="sm" />
                <span>{{channel.name}}</span>
                {{#if (this.unreadCountFor channel.id)}}
                  <span class="workspace-unread-badge margin-left-auto">
                    {{this.unreadLabel (this.unreadCountFor channel.id)}}
                  </span>
                {{/if}}
              </button>
            {{/each}}
          </div>
        </div>
        <div class="workspace-content-panel">
          {{yield}}
        </div>
      </div>

      {{#if this.isCreateChannelOpen}}
        <div
          class="workspace-channel-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Create channel"
        >
          <div
            class="workspace-channel-modal__panel layout-vertical --gap-lg --padding-xl"
          >
            <div class="layout-horizontal --gap-md">
              <div class="layout-vertical --gap-xs">
                <h2 class="margin-zero">Create channel</h2>
                <p class="margin-zero font-color-text-secondary">
                  Add a channel for focused group conversation.
                </p>
              </div>
              <UiIconButton
                class="margin-left-auto"
                @iconName="x"
                @onClick={{this.closeCreateChannelModal}}
                aria-label="Close create channel modal"
              />
            </div>

            <UiInput
              @value={{this.newChannelName}}
              @placeholder="Channel name"
              @onInput={{this.updateNewChannelName}}
            />

            <div class="layout-vertical --gap-sm">
              <strong>Members</strong>
              <div
                class="workspace-channel-modal__members layout-vertical --gap-xs"
              >
                {{#each this.communicationMembers as |member|}}
                  <UiCheckbox
                    class="workspace-channel-modal__member"
                    @checked={{this.isNewChannelMemberSelected member}}
                    @onChange={{fn this.toggleNewChannelMember member}}
                  >
                    <span class="layout-horizontal --gap-sm">
                      <UiAvatar @model={{member}} @size="sm" />
                      <span class="workspace-channel-modal__member-copy">
                        <strong>{{member.fullName}}</strong>
                        <small>@{{member.username}}</small>
                      </span>
                    </span>
                  </UiCheckbox>
                {{/each}}
              </div>
            </div>

            {{#if this.channelErrorMessage}}
              <p class="margin-zero workspace-channel-modal__error">
                {{this.channelErrorMessage}}
              </p>
            {{/if}}

            <div class="layout-horizontal --gap-sm --justify-end">
              <UiButton
                @text="Cancel"
                @hierarchy="secondary"
                @onClick={{this.closeCreateChannelModal}}
              />
              <UiButton
                @text="Create channel"
                @iconRight="plus"
                @disabled={{not this.canCreateChannel}}
                @loading={{this.isCreatingChannel}}
                @onClick={{this.createChannel}}
              />
            </div>
          </div>
        </div>
      {{/if}}
    </div>
  </template>
}

type StoreLike = {
  findRecord(modelName: 'user', id: number): Promise<UserModel>;
  query(
    modelName: 'workspace-member',
    query: Record<string, unknown>
  ): Promise<ArrayLike<WorkspaceMemberModel>>;
};

type JsonApiResource = {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<
    string,
    { data?: JsonApiResourceIdentifier | JsonApiResourceIdentifier[] | null }
  >;
};

type JsonApiResourceIdentifier = {
  id: string;
  type: string;
};

type JsonApiDocument = {
  data: JsonApiResource | JsonApiResource[];
  included?: JsonApiResource[];
};

type RawCommunicationChannel = {
  id: number;
  workspaceId: number;
  type: 'DIRECT' | 'GROUP';
  name?: string;
  updatedAt?: string;
  members?: Array<{ userId: number; mutedAt?: string | null }>;
};

function parseChannels(payload: unknown): CommunicationChannel[] {
  if (Array.isArray(payload)) {
    return payload.map((resource) =>
      parseRawChannel(resource as RawCommunicationChannel)
    );
  }

  if (!isJsonApiDocument(payload)) return [];

  const data = Array.isArray(payload.data) ? payload.data : [payload.data];
  const included = new Map(
    (payload.included ?? []).map((resource) => [
      `${resource.type}:${resource.id}`,
      resource,
    ])
  );

  return data.map((resource) => parseJsonApiChannel(resource, included));
}

function parseChannel(payload: unknown): CommunicationChannel {
  return (
    parseChannels(payload)[0] ??
    parseRawChannel(payload as RawCommunicationChannel)
  );
}

function parseRawChannel(
  resource: RawCommunicationChannel
): CommunicationChannel {
  return {
    id: Number(resource.id),
    workspaceId: Number(resource.workspaceId),
    type: resource.type,
    name: resource.name,
    updatedAt: resource.updatedAt,
    members: (resource.members ?? []).map((member) => ({
      userId: Number(member.userId),
      mutedAt: member.mutedAt,
    })),
    messages: [],
  };
}

function parseJsonApiChannel(
  resource: JsonApiResource,
  included: Map<string, JsonApiResource>
): CommunicationChannel {
  const memberRefs = asArray(resource.relationships?.members?.data);

  return {
    id: Number(resource.id),
    workspaceId: Number(resource.attributes?.workspaceId),
    type: resource.attributes?.type as 'DIRECT' | 'GROUP',
    name: resource.attributes?.name as string | undefined,
    updatedAt: resource.attributes?.updatedAt as string | undefined,
    members: memberRefs
      .map((ref) => included.get(`${ref.type}:${ref.id}`))
      .filter(Boolean)
      .map((member) => ({
        userId: Number(member?.attributes?.userId),
        mutedAt: member?.attributes?.mutedAt as string | null | undefined,
      })),
    messages: [],
  };
}

function asArray(
  value?: JsonApiResourceIdentifier | JsonApiResourceIdentifier[] | null
): JsonApiResourceIdentifier[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function isJsonApiDocument(value: unknown): value is JsonApiDocument {
  return (
    value !== null &&
    typeof value === 'object' &&
    'data' in value &&
    (Array.isArray((value as JsonApiDocument).data) ||
      Boolean((value as JsonApiDocument).data))
  );
}
