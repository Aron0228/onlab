import Component from '@glimmer/component';
import type Owner from '@ember/owner';
import { action } from '@ember/object';
import { fn, hash } from '@ember/helper';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { eq } from 'ember-truth-helpers';
import { modifier } from 'ember-modifier';
import UiAvatar from 'client/components/ui/avatar';
import UiButton from 'client/components/ui/button';
import UiCheckbox from 'client/components/ui/checkbox';
import UiContainer from 'client/components/ui/container';
import UiIcon from 'client/components/ui/icon';
import UiIconButton from 'client/components/ui/icon-button';
import UiInput from 'client/components/ui/input';
import type {
  CommunicationAttachment,
  CommunicationChannel,
  CommunicationMember,
  CommunicationMessage,
  WorkspacesEditCommunicationRouteModel,
} from 'client/routes/workspaces/edit/communication';
import type ApiService from 'client/services/api';
import type SessionAccountService from 'client/services/session-account';
import type SessionService from 'ember-simple-auth/services/session';

type SocketLike = {
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

type SocketResponse = {
  ok: boolean;
  error?: string;
  message?: CommunicationMessage;
};

type PresenceRequestResponse = {
  onlineUserIds?: number[];
};

type TypingUpdatePayload = {
  channelId: number;
  userId: number;
  isTyping: boolean;
};

type PresenceSnapshotPayload = {
  onlineUserIds?: number[];
};

type PresenceUpdatePayload = {
  userId: number;
  isOnline: boolean;
  lastSeenAt?: string;
};

type MessageRenderItem = {
  type: 'divider' | 'message';
  id: string;
  label?: string;
  message?: CommunicationMessage;
  isGrouped?: boolean;
  showMeta?: boolean;
};

type JsonApiDocument = {
  data: {
    id: string;
    attributes?: Record<string, unknown>;
    relationships?: Record<string, { data?: unknown }>;
  };
  included?: Array<{
    id: string;
    type: string;
    attributes?: Record<string, unknown>;
    relationships?: Record<string, { data?: unknown }>;
  }>;
};

interface Signature {
  Args: {
    model: WorkspacesEditCommunicationRouteModel;
  };
}

export default class RoutesWorkspacesEditCommunication extends Component<Signature> {
  @service declare api: ApiService;
  @service declare session: SessionService;
  @service declare sessionAccount: SessionAccountService;
  @service('socket-io') declare socketIOService: SocketIoServiceLike;

  @tracked channels: CommunicationChannel[] = [];
  @tracked selectedChannelId: number | null = null;
  @tracked messages: CommunicationMessage[] = [];
  @tracked draft = '';
  @tracked selectedFile: File | null = null;
  @tracked selectedFilePreviewUrl: string | null = null;
  @tracked search = '';
  @tracked errorMessage: string | null = null;
  @tracked isSending = false;
  @tracked isThreadPinnedToBottom = true;
  @tracked imagePreviewUrl: string | null = null;
  @tracked imagePreviewAlt = '';
  @tracked typingUserIds: number[] = [];
  @tracked unreadCounts: Record<number, number> = {};
  @tracked onlineUserIds: number[] = [];
  @tracked lastSeenByUserId: Record<number, string> = {};
  @tracked isChannelMenuOpen = false;
  @tracked isChannelSettingsOpen = false;
  @tracked settingsChannelName = '';
  @tracked settingsMemberIds: number[] = [];
  @tracked isUpdatingChannel = false;
  @tracked isDeletingChannel = false;
  @tracked channelActionError: string | null = null;

  private socket?: SocketLike;
  private threadElement?: HTMLElement;
  private typingStopTimer?: ReturnType<typeof globalThis.setTimeout>;
  private typingExpiryTimers = new Map<
    number,
    ReturnType<typeof globalThis.setTimeout>
  >();

  constructor(owner: Owner, args: Signature['Args']) {
    super(owner, args);
    this.channels = args.model.channels;
    this.selectedChannelId = args.model.selectedChannelId;
    this.messages = this.selectedChannel?.messages ?? [];
    this.scheduleAfterRender(() => {
      this.connectSocket();
    });
  }

  willDestroy(): void {
    super.willDestroy();
    this.socket?.off('message:created', this.onSocketMessage);
    this.socket?.off('channel:updated', this.onChannelUpdated);
    this.socket?.off('typing:updated', this.onTypingUpdated);
    this.socket?.off('presence:snapshot', this.onPresenceSnapshot);
    this.socket?.off('presence:updated', this.onPresenceUpdated);
    this.emitTyping(false);
    this.clearTypingTimers();
    this.revokeSelectedFilePreviewUrl();
  }

  get workspaceId(): number {
    return Number(this.args.model.workspace.id);
  }

  get currentUserId(): number {
    return Number(this.sessionAccount.id);
  }

  get initialChannelId(): number | null {
    return this.args.model.selectedChannelId;
  }

  get selectedChannel(): CommunicationChannel | null {
    return (
      this.channels.find((channel) => channel.id === this.selectedChannelId) ??
      null
    );
  }

  get selectedDirectMember(): CommunicationMember | null {
    const channel = this.selectedChannel;
    if (channel?.type !== 'DIRECT') return null;

    const userId = this.otherDirectMemberId(channel);
    return this.memberFor(userId);
  }

  get selectedChannelOnlineMemberCount(): number {
    const channel = this.selectedChannel;
    if (!channel) return 0;

    return channel.members.filter(
      (member) =>
        member.userId === this.currentUserId ||
        this.onlineUserIds.includes(member.userId)
    ).length;
  }

  get channelHeaderSubtitle(): string {
    const onlineCount = this.selectedChannelOnlineMemberCount;

    return `${onlineCount} online`;
  }

  get canManageSelectedChannel(): boolean {
    return Boolean(this.selectedChannel);
  }

  get selectedChannelIsGroup(): boolean {
    return this.selectedChannel?.type === 'GROUP';
  }

  get selectedChannelMuted(): boolean {
    return Boolean(this.currentChannelMembership?.mutedAt);
  }

  get settingsAvailableMembers(): CommunicationMember[] {
    return this.args.model.members.filter(
      (member) => member.userId !== this.currentUserId
    );
  }

  get directChannels(): CommunicationChannel[] {
    return this.channels.filter((channel) => channel.type === 'DIRECT');
  }

  get shouldShowDirectMessageRail(): boolean {
    return this.selectedChannel?.type !== 'GROUP';
  }

  get filteredMembers(): CommunicationMember[] {
    const query = this.search.trim().toLowerCase();
    const members = this.args.model.members.filter(
      (member) => member.userId !== this.currentUserId
    );

    if (!query) return members;

    return members.filter((member) =>
      `${member.fullName} ${member.username}`.toLowerCase().includes(query)
    );
  }

  get headerTitle(): string {
    const channel = this.selectedChannel;
    if (!channel) return 'Communication';
    if (channel.type === 'GROUP') return `# ${channel.name ?? 'channel'}`;
    return this.memberName(this.otherDirectMemberId(channel));
  }

  get headerPresenceLabel(): string {
    const member = this.selectedDirectMember;
    if (!member) return '';
    return this.memberPresenceLabel(member);
  }

  get composerPlaceholder(): string {
    const channel = this.selectedChannel;
    if (!channel) return 'Select a conversation';
    return channel.type === 'GROUP'
      ? `Message #${channel.name ?? 'channel'}`
      : `Message ${this.memberName(this.otherDirectMemberId(channel))}`;
  }

  get canSend(): boolean {
    return (
      Boolean(this.selectedChannelId) &&
      !this.isSending &&
      (this.draft.trim().length > 0 || this.selectedFile !== null)
    );
  }

  get currentChannelMembership():
    | { userId: number; mutedAt?: string | null }
    | undefined {
    return this.selectedChannel?.members.find(
      (member) => member.userId === this.currentUserId
    );
  }

  get selectedConversationMuteLabel(): string {
    const channel = this.selectedChannel;
    const target = channel?.type === 'DIRECT' ? 'DM' : 'channel';

    return `${this.selectedChannelMuted ? 'Unmute' : 'Mute'} ${target}`;
  }

  get typingIndicatorText(): string {
    const names = this.typingUserIds.map((userId) => this.memberName(userId));

    if (names.length === 0) return '';
    if (names.length === 1) return `${names[0]} is typing...`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing...`;
    return 'Several people are typing...';
  }

  get messageItems(): MessageRenderItem[] {
    const items: MessageRenderItem[] = [];
    const sortedMessages = [...this.messages].sort(
      (a, b) => this.messageTimestamp(a) - this.messageTimestamp(b)
    );

    sortedMessages.forEach((message, index) => {
      const previous = sortedMessages[index - 1];
      const elapsedSincePrevious = previous
        ? this.messageTimestamp(message) - this.messageTimestamp(previous)
        : Number.POSITIVE_INFINITY;
      const isGrouped =
        Boolean(previous) &&
        previous?.senderId === message.senderId &&
        elapsedSincePrevious <= 5 * 60 * 1000;

      if (!previous || elapsedSincePrevious >= 60 * 60 * 1000) {
        items.push({
          type: 'divider',
          id: `divider-${message.id}`,
          label: this.formatDividerTime(message.createdAt),
        });
      }

      items.push({
        type: 'message',
        id: `message-${message.id}`,
        message,
        isGrouped,
        showMeta: !isGrouped,
      });
    });

    return items;
  }

  registerThread = modifier(
    (element: HTMLElement, [channelId]: [number | null]) => {
      void channelId;

      this.threadElement = element;
      this.scheduleThreadScrollToBottom(true);

      return () => {
        if (this.threadElement === element) {
          this.threadElement = undefined;
        }
      };
    }
  );

  syncModelSelection = modifier(
    (
      _element: HTMLElement,
      [channelId, channels]: [number | null, CommunicationChannel[]]
    ) => {
      this.scheduleAfterRender(() => {
        this.applyModelSelection(channelId, channels);
      });
    }
  );

  @action selectChannel(channel: CommunicationChannel): void {
    this.emitTyping(false);
    this.selectedChannelId = channel.id;
    this.messages = channel.messages;
    this.markChannelRead(channel.id);
    this.socket?.emit('channel:join', channel.id);
    this.isThreadPinnedToBottom = true;
    this.scheduleThreadScrollToBottom(true);
  }

  @action async selectDirectMember(member: CommunicationMember): Promise<void> {
    let channel = this.directChannels.find((candidate) =>
      candidate.members.some((item) => item.userId === member.userId)
    );

    if (!channel) {
      const payload = await this.api.request(
        `/communication/workspaces/${this.workspaceId}/direct-channels`,
        {
          method: 'POST',
          body: { participantId: member.userId },
        }
      );
      channel = parseChannel(payload);
      this.channels = [channel, ...this.channels];
    }

    this.selectChannel(channel);
  }

  @action updateDraft(value: string): void {
    this.draft = value;
    this.updateTypingState();
  }

  @action updateSearch(value: string): void {
    this.search = value;
  }

  @action toggleChannelMenu(event?: Event): void {
    event?.stopPropagation();
    this.channelActionError = null;
    this.isChannelMenuOpen = !this.isChannelMenuOpen;
  }

  @action async toggleMuteSelectedChannel(): Promise<void> {
    const channel = this.selectedChannel;
    if (!channel) return;

    const muted = !this.selectedChannelMuted;
    this.channelActionError = null;

    try {
      const payload = await this.api.request(
        `/communication/channels/${channel.id}/mute`,
        {
          method: 'PATCH',
          body: { muted },
        }
      );
      const membership = parseChannelMember(payload);
      const mutedAt = membership.mutedAt ?? null;

      this.replaceChannel({
        ...channel,
        members: channel.members.map((member) =>
          member.userId === this.currentUserId ? { ...member, mutedAt } : member
        ),
      });
      globalThis.dispatchEvent?.(
        new CustomEvent('communication:channel-muted', {
          detail: {
            channel: this.selectedChannel,
            channelId: channel.id,
            mutedAt,
          },
        })
      );
      this.isChannelMenuOpen = false;
    } catch (error) {
      this.channelActionError =
        error instanceof Error ? error.message : 'Mute update failed.';
    }
  }

  @action openChannelSettings(): void {
    const channel = this.selectedChannel;
    if (!channel || channel.type !== 'GROUP') return;

    this.settingsChannelName = channel.name ?? '';
    this.settingsMemberIds = [];
    this.channelActionError = null;
    this.isChannelMenuOpen = false;
    this.isChannelSettingsOpen = true;
  }

  @action closeChannelSettings(): void {
    this.isChannelSettingsOpen = false;
    this.channelActionError = null;
  }

  @action updateSettingsChannelName(value: string): void {
    this.settingsChannelName = value;
  }

  @action toggleSettingsMember(
    member: CommunicationMember,
    checked: boolean
  ): void {
    if (this.isSettingsMemberAlreadyInChannel(member)) return;

    this.settingsMemberIds = checked
      ? [...new Set([...this.settingsMemberIds, member.userId])]
      : this.settingsMemberIds.filter((userId) => userId !== member.userId);
  }

  @action async saveChannelSettings(): Promise<void> {
    const channel = this.selectedChannel;
    if (!channel || channel.type !== 'GROUP') return;

    this.isUpdatingChannel = true;
    this.channelActionError = null;

    try {
      let updatedChannel = channel;
      const name = this.settingsChannelName.trim();

      if (name && name !== channel.name) {
        const payload = await this.api.request(
          `/communication/channels/${channel.id}`,
          {
            method: 'PATCH',
            body: { name },
          }
        );
        updatedChannel = {
          ...updatedChannel,
          ...parseChannel(payload),
          messages: updatedChannel.messages,
        };
      }

      for (const userId of this.settingsMemberIds) {
        await this.api.request(
          `/communication/channels/${channel.id}/members`,
          {
            method: 'POST',
            body: { userId },
          }
        );
      }

      const memberIds = new Set([
        ...updatedChannel.members.map((member) => member.userId),
        ...this.settingsMemberIds,
      ]);

      this.replaceChannel({
        ...updatedChannel,
        members: [...memberIds].map((userId) => ({ userId })),
      });
      this.isChannelSettingsOpen = false;
      this.settingsMemberIds = [];
    } catch (error) {
      this.channelActionError =
        error instanceof Error ? error.message : 'Channel update failed.';
    } finally {
      this.isUpdatingChannel = false;
    }
  }

  @action async leaveSelectedChannel(): Promise<void> {
    const channel = this.selectedChannel;
    if (!channel || channel.type !== 'GROUP') return;

    this.isUpdatingChannel = true;
    this.channelActionError = null;

    try {
      await this.api.request(`/communication/channels/${channel.id}/leave`, {
        method: 'POST',
      });
      this.removeChannel(channel.id);
    } catch (error) {
      this.channelActionError =
        error instanceof Error ? error.message : 'Could not leave channel.';
    } finally {
      this.isUpdatingChannel = false;
      this.isChannelMenuOpen = false;
    }
  }

  @action async deleteSelectedChannel(): Promise<void> {
    const channel = this.selectedChannel;
    if (!channel || channel.type !== 'GROUP') return;

    this.isDeletingChannel = true;
    this.channelActionError = null;

    try {
      await this.api.request(`/communication/channels/${channel.id}`, {
        method: 'DELETE',
      });
      this.removeChannel(channel.id);
      this.isChannelSettingsOpen = false;
    } catch (error) {
      this.channelActionError =
        error instanceof Error ? error.message : 'Could not delete channel.';
    } finally {
      this.isDeletingChannel = false;
    }
  }

  @action updateSelectedFile(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;

    this.revokeSelectedFilePreviewUrl();
    this.selectedFile = file;
    this.selectedFilePreviewUrl = file?.type.startsWith('image/')
      ? URL.createObjectURL(file)
      : null;
  }

  @action clearSelectedFile(): void {
    this.revokeSelectedFilePreviewUrl();
    this.selectedFile = null;

    const input =
      this.threadElement?.parentElement?.querySelector<HTMLInputElement>(
        '.communication-composer__file'
      );
    if (input) {
      input.value = '';
    }
  }

  @action async sendMessage(): Promise<void> {
    if (!this.selectedChannelId || !this.canSend) return;

    this.isSending = true;
    this.errorMessage = null;
    this.emitTyping(false);

    try {
      const attachmentIds = this.selectedFile
        ? [await this.uploadAttachment(this.selectedFile)]
        : [];

      this.socket?.emit(
        'message:send',
        {
          channelId: this.selectedChannelId,
          content: this.draft,
          attachmentIds,
        },
        (rawResponse) => {
          const response = rawResponse as SocketResponse;

          if (!response.ok) {
            this.errorMessage = response.error ?? 'Message failed.';
          }
        }
      );

      this.draft = '';
      this.clearSelectedFile();
    } catch (error) {
      this.errorMessage =
        error instanceof Error ? error.message : 'Message failed.';
    } finally {
      this.isSending = false;
    }
  }

  @action sendOnEnter(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    void this.sendMessage();
  }

  @action openFilePicker(event: MouseEvent): void {
    const input = (event.currentTarget as HTMLElement)
      .closest('.communication-composer')
      ?.querySelector<HTMLInputElement>('.communication-composer__file');
    input?.click();
  }

  @action onThreadScroll(event: Event): void {
    this.isThreadPinnedToBottom = this.isElementScrolledToBottom(
      event.currentTarget as HTMLElement
    );
  }

  @action onAttachmentImageLoad(): void {
    if (!this.isThreadPinnedToBottom) return;

    this.scheduleThreadScrollToBottom();
  }

  @action openImagePreview(url?: string | null, alt?: string): void {
    if (!url) return;

    this.imagePreviewUrl = url;
    this.imagePreviewAlt = alt ?? 'Image preview';
  }

  @action closeImagePreview(): void {
    this.imagePreviewUrl = null;
    this.imagePreviewAlt = '';
  }

  isOwnMessage = (message: CommunicationMessage): boolean => {
    return message.senderId === this.currentUserId;
  };

  memberName = (userId?: number): string => {
    return (
      this.args.model.members.find((member) => member.userId === userId)
        ?.fullName ?? 'Unknown user'
    );
  };

  memberFor = (userId?: number): CommunicationMember | null => {
    return (
      this.args.model.members.find((member) => member.userId === userId) ?? null
    );
  };

  isMemberOnline = (member: CommunicationMember): boolean => {
    return this.onlineUserIds.includes(member.userId);
  };

  memberPresenceLabel = (member: CommunicationMember): string => {
    if (this.isMemberOnline(member)) return 'Online';

    const lastSeenAt = this.lastSeenByUserId[member.userId];
    return lastSeenAt
      ? `Last seen ${this.formatRelativeTime(lastSeenAt)}`
      : 'Offline';
  };

  isSettingsMemberAlreadyInChannel = (member: CommunicationMember): boolean => {
    return (
      this.selectedChannel?.members.some(
        (channelMember) => channelMember.userId === member.userId
      ) ?? false
    );
  };

  isSettingsMemberChecked = (member: CommunicationMember): boolean => {
    return (
      this.isSettingsMemberAlreadyInChannel(member) ||
      this.settingsMemberIds.includes(member.userId)
    );
  };

  directUnreadCountFor = (member: CommunicationMember): number => {
    const channel = this.directChannels.find((candidate) =>
      candidate.members.some((item) => item.userId === member.userId)
    );

    return channel ? (this.unreadCounts[channel.id] ?? 0) : 0;
  };

  unreadLabel = (count: number): string => {
    return count > 99 ? '99+' : String(count);
  };

  memberInitials = (userId?: number): string => {
    const name = this.memberName(userId);
    return name
      .split(' ')
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  };

  otherDirectMemberId = (
    channel: CommunicationChannel | null
  ): number | undefined => {
    return channel?.members.find(
      (member) => member.userId !== this.currentUserId
    )?.userId;
  };

  formatTime = (value?: string): string => {
    if (!value) return '';
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value));
  };

  formatDividerTime = (value?: string): string => {
    if (!value) return '';

    const date = new Date(value);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const time = new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);

    if (date.toDateString() === today.toDateString()) {
      return `Today, ${time}`;
    }

    if (date.toDateString() === yesterday.toDateString()) {
      return `Yesterday, ${time}`;
    }

    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  };

  formatFileSize = (value?: number): string => {
    if (!value) return '';
    if (value < 1024 * 1024) return `${Math.ceil(value / 1024)}KB`;
    return `${(value / (1024 * 1024)).toFixed(1)}MB`;
  };

  fileDownloadUrl = (attachment: CommunicationAttachment): string => {
    const token = this.session.data.authenticated?.token;
    const url = new URL(
      `/files/${attachment.fileId}/download`,
      import.meta.env.VITE_API_URL as string
    );

    if (token) url.searchParams.set('token', token);

    return url.toString();
  };

  filePreviewUrl = (attachment: CommunicationAttachment): string => {
    const token = this.session.data.authenticated?.token;
    const url = new URL(
      `/files/${attachment.fileId}/preview`,
      import.meta.env.VITE_API_URL as string
    );

    if (token) url.searchParams.set('token', token);

    return url.toString();
  };

  isImageAttachment = (attachment: CommunicationAttachment): boolean => {
    return attachment.file?.mimeType.startsWith('image/') ?? false;
  };

  messageHasText = (message: CommunicationMessage): boolean => {
    return Boolean(message.content?.trim());
  };

  messageHasOnlyImageAttachments = (message: CommunicationMessage): boolean => {
    return (
      !this.messageHasText(message) &&
      message.attachments.length > 0 &&
      message.attachments.every(this.isImageAttachment)
    );
  };

  get selectedFileIsImage(): boolean {
    return this.selectedFile?.type.startsWith('image/') ?? false;
  }

  private replaceChannel(channel: CommunicationChannel): void {
    this.channels = this.channels.map((candidate) =>
      candidate.id === channel.id ? channel : candidate
    );

    if (this.selectedChannelId === channel.id) {
      this.messages = channel.messages;
    }
  }

  private removeChannel(channelId: number): void {
    this.channels = this.channels.filter((channel) => channel.id !== channelId);

    if (this.selectedChannelId === channelId) {
      this.selectedChannelId = null;
      this.messages = [];
      this.emitTyping(false);
    }
  }

  private scheduleAfterRender(callback: FrameRequestCallback): void {
    const schedule =
      globalThis.requestAnimationFrame ??
      ((frameCallback: FrameRequestCallback) =>
        globalThis.setTimeout(frameCallback, 0));

    schedule(callback);
  }

  private connectSocket = (): void => {
    const token = this.session.data.authenticated?.token;
    if (!token) return;
    if (this.socket) return;

    const socket = this.socketIOService.socketFor(
      import.meta.env.VITE_API_URL as string,
      {
        query: { token },
      }
    );

    socket.on('message:created', this.onSocketMessage, this);
    socket.on('channel:updated', this.onChannelUpdated, this);
    socket.on('typing:updated', this.onTypingUpdated, this);
    socket.on('presence:snapshot', this.onPresenceSnapshot, this);
    socket.on('presence:updated', this.onPresenceUpdated, this);

    this.socket = socket;

    socket.emit('presence:request', {}, (rawResponse) => {
      const response = rawResponse as PresenceRequestResponse;

      this.onPresenceSnapshot(response);
    });

    if (this.selectedChannelId) {
      socket.emit('channel:join', this.selectedChannelId);
    }
  };

  private onSocketMessage = (payload: unknown): void => {
    const message = payload as CommunicationMessage;
    if (message.channelId !== this.selectedChannelId) return;
    const shouldScroll = this.isThreadPinnedToBottom;

    this.messages = [
      ...this.messages.filter((item) => item.id !== message.id),
      message,
    ];
    this.removeTypingUser(message.senderId);
    this.channels = this.channels.map((channel) =>
      channel.id === message.channelId
        ? { ...channel, messages: this.messages, updatedAt: message.createdAt }
        : channel
    );

    if (shouldScroll) {
      this.scheduleThreadScrollToBottom();
    }
  };

  private onChannelUpdated = (payload: unknown): void => {
    const update = payload as {
      channelId: number;
      message: CommunicationMessage;
    };

    this.channels = this.channels.map((channel) =>
      channel.id === update.channelId
        ? {
            ...channel,
            messages: [
              ...channel.messages.filter(
                (item) => item.id !== update.message.id
              ),
              update.message,
            ],
            updatedAt: update.message.createdAt,
          }
        : channel
    );

    if (
      update.message.senderId !== this.currentUserId &&
      update.channelId !== this.selectedChannelId
    ) {
      this.unreadCounts = {
        ...this.unreadCounts,
        [update.channelId]: (this.unreadCounts[update.channelId] ?? 0) + 1,
      };
    }
  };

  private onTypingUpdated = (payload: unknown): void => {
    const update = payload as TypingUpdatePayload;

    if (
      update.channelId !== this.selectedChannelId ||
      update.userId === this.currentUserId
    ) {
      return;
    }

    if (!update.isTyping) {
      this.removeTypingUser(update.userId);
      return;
    }

    this.typingUserIds = [
      ...this.typingUserIds.filter((userId) => userId !== update.userId),
      update.userId,
    ];
    this.resetTypingExpiry(update.userId);

    if (this.isThreadPinnedToBottom) {
      this.scheduleThreadScrollToBottom();
    }
  };

  private onPresenceSnapshot = (payload: unknown): void => {
    const snapshot = payload as PresenceSnapshotPayload;
    this.onlineUserIds = [...new Set(snapshot.onlineUserIds ?? [])].filter(
      (userId) => userId !== this.currentUserId
    );
  };

  private onPresenceUpdated = (payload: unknown): void => {
    const update = payload as PresenceUpdatePayload;
    if (update.userId === this.currentUserId) return;

    this.onlineUserIds = update.isOnline
      ? [...new Set([...this.onlineUserIds, update.userId])]
      : this.onlineUserIds.filter((userId) => userId !== update.userId);

    if (!update.isOnline && update.lastSeenAt) {
      this.lastSeenByUserId = {
        ...this.lastSeenByUserId,
        [update.userId]: update.lastSeenAt,
      };
    }
  };

  private async uploadAttachment(file: File): Promise<number> {
    const body = new FormData();
    const params: Record<string, string> = {
      workspaceId: String(this.workspaceId),
    };
    const token = this.session.data.authenticated?.token;

    if (token) params.token = String(token);
    body.append('file', file);

    const data = (await this.api.request('/files/upload', {
      method: 'POST',
      params,
      body,
    })) as { id: number };

    return Number(data.id);
  }

  private revokeSelectedFilePreviewUrl(): void {
    if (!this.selectedFilePreviewUrl) return;

    URL.revokeObjectURL(this.selectedFilePreviewUrl);
    this.selectedFilePreviewUrl = null;
  }

  private applyModelSelection = (
    channelId: number | null,
    channels: CommunicationChannel[]
  ): void => {
    const hasChannelListChanged = this.channels !== channels;
    const hasSelectedChannelChanged = this.selectedChannelId !== channelId;
    const selectedChannel =
      channels.find((channel) => channel.id === channelId) ?? null;
    const nextMessages = selectedChannel?.messages ?? [];

    if (hasChannelListChanged) {
      this.channels = channels;
    }

    if (!hasSelectedChannelChanged) {
      if (this.messages !== nextMessages) {
        this.messages = nextMessages;
      }
      return;
    }

    this.emitTyping(false);
    this.selectedChannelId = channelId;
    this.messages = nextMessages;
    this.isThreadPinnedToBottom = true;
    this.typingUserIds = [];
    this.clearTypingTimers();

    if (channelId) {
      this.markChannelRead(channelId);
    }

    if (channelId) {
      this.socket?.emit('channel:join', channelId);
    }

    this.scheduleThreadScrollToBottom(true);
  };

  private updateTypingState(): void {
    const isTyping = this.draft.trim().length > 0;
    this.emitTyping(isTyping);

    if (this.typingStopTimer) {
      globalThis.clearTimeout(this.typingStopTimer);
    }

    if (!isTyping) return;

    this.typingStopTimer = globalThis.setTimeout(() => {
      this.emitTyping(false);
    }, 2200);
  }

  private emitTyping(isTyping: boolean): void {
    if (!this.selectedChannelId) return;

    this.socket?.emit('typing:update', {
      channelId: this.selectedChannelId,
      isTyping,
    });

    if (!isTyping && this.typingStopTimer) {
      globalThis.clearTimeout(this.typingStopTimer);
      this.typingStopTimer = undefined;
    }
  }

  private resetTypingExpiry(userId: number): void {
    const existingTimer = this.typingExpiryTimers.get(userId);
    if (existingTimer) {
      globalThis.clearTimeout(existingTimer);
    }

    const timer = globalThis.setTimeout(() => {
      this.removeTypingUser(userId);
    }, 3200);

    this.typingExpiryTimers.set(userId, timer);
  }

  private removeTypingUser(userId: number): void {
    const timer = this.typingExpiryTimers.get(userId);
    if (timer) {
      globalThis.clearTimeout(timer);
      this.typingExpiryTimers.delete(userId);
    }

    this.typingUserIds = this.typingUserIds.filter((item) => item !== userId);
  }

  private clearTypingTimers(): void {
    if (this.typingStopTimer) {
      globalThis.clearTimeout(this.typingStopTimer);
      this.typingStopTimer = undefined;
    }

    for (const timer of this.typingExpiryTimers.values()) {
      globalThis.clearTimeout(timer);
    }

    this.typingExpiryTimers.clear();
  }

  private markChannelRead(channelId: number): void {
    if (this.unreadCounts[channelId]) {
      const unreadCounts = { ...this.unreadCounts };
      delete unreadCounts[channelId];
      this.unreadCounts = unreadCounts;
    }

    globalThis.dispatchEvent?.(
      new CustomEvent('communication:channel-read', {
        detail: { channelId },
      })
    );
  }

  private scheduleThreadScrollToBottom(force = false): void {
    if (!force && !this.isThreadPinnedToBottom) return;

    const requestFrame = globalThis.requestAnimationFrame;
    if (!requestFrame) {
      globalThis.setTimeout(this.scrollThreadToBottom, 0);
      return;
    }

    requestFrame(() => {
      this.scrollThreadToBottom();
      requestFrame(this.scrollThreadToBottom);
    });

    globalThis.setTimeout(this.scrollThreadToBottom, 120);
  }

  private scrollThreadToBottom = (): void => {
    const element = this.threadElement;
    if (!element) return;

    element.scrollTop = element.scrollHeight;
    this.isThreadPinnedToBottom = true;
  };

  private isElementScrolledToBottom(element: HTMLElement): boolean {
    const threshold = 48;
    return (
      element.scrollHeight - element.scrollTop - element.clientHeight <=
      threshold
    );
  }

  private messageTimestamp(message: CommunicationMessage): number {
    return message.createdAt ? new Date(message.createdAt).getTime() : 0;
  }

  private formatRelativeTime(value: string): string {
    const elapsed = Date.now() - new Date(value).getTime();
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (elapsed < minute) return 'just now';
    if (elapsed < hour) return `${Math.floor(elapsed / minute)}m ago`;
    if (elapsed < day) return `${Math.floor(elapsed / hour)}h ago`;
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
    }).format(new Date(value));
  }

  <template>
    <section
      class="communication-shell
        {{unless this.shouldShowDirectMessageRail '--thread-only'}}"
      {{this.syncModelSelection @model.selectedChannelId @model.channels}}
    >
      {{#if this.shouldShowDirectMessageRail}}
        <aside class="communication-rail layout-vertical --gap-xl --padding-lg">
          <div class="layout-vertical --gap-md">
            <h2 class="margin-zero">Direct Messages</h2>
            <UiInput
              @value={{this.search}}
              @placeholder="Search people..."
              @onInput={{this.updateSearch}}
            />
            <div class="layout-vertical --gap-xs">
              {{#each this.filteredMembers as |member|}}
                <button
                  type="button"
                  class="communication-person layout-horizontal --gap-sm"
                  {{on "click" (fn this.selectDirectMember member)}}
                >
                  <span class="communication-presence-avatar">
                    <UiAvatar @model={{member}} @size="sm" />
                    <span
                      class="communication-presence-dot
                        {{if (this.isMemberOnline member) '--online'}}"
                    ></span>
                  </span>
                  <span class="communication-person__copy">
                    <strong>{{member.fullName}}</strong>
                    <small>{{this.memberPresenceLabel member}}</small>
                  </span>
                  {{#if (this.directUnreadCountFor member)}}
                    <span class="communication-unread-badge margin-left-auto">
                      {{this.unreadLabel (this.directUnreadCountFor member)}}
                    </span>
                  {{/if}}
                </button>
              {{/each}}
            </div>
          </div>
        </aside>
      {{/if}}

      {{#if this.selectedChannel}}
        <main class="communication-main">
          <header
            class="communication-header layout-horizontal --gap-md --padding-lg"
          >
            {{#if this.selectedDirectMember}}
              <span class="communication-presence-avatar --header">
                <UiAvatar @model={{this.selectedDirectMember}} @size="sm" />
                <span
                  class="communication-presence-dot
                    {{if
                      (this.isMemberOnline this.selectedDirectMember)
                      '--online'
                    }}"
                ></span>
              </span>
              <div class="layout-vertical --gap-xs">
                <h2
                  class="margin-zero"
                >{{this.selectedDirectMember.fullName}}</h2>
                <p class="margin-zero font-color-text-secondary">
                  {{this.headerPresenceLabel}}
                </p>
              </div>
            {{else}}
              <div class="layout-vertical --gap-xs">
                <h2 class="margin-zero">{{this.headerTitle}}</h2>
                <p class="margin-zero font-color-text-secondary">
                  {{this.channelHeaderSubtitle}}
                </p>
              </div>
            {{/if}}
            {{#if this.canManageSelectedChannel}}
              <div class="communication-header__menu">
                <UiIconButton
                  class="communication-header__menu-trigger"
                  @iconName="dots-vertical"
                  @onClick={{this.toggleChannelMenu}}
                  aria-label="Channel actions"
                />
                {{#if this.isChannelMenuOpen}}
                  <div class="communication-header__menu-popover">
                    <button
                      type="button"
                      class="communication-header__menu-item"
                      {{on "click" this.toggleMuteSelectedChannel}}
                    >
                      <UiIcon
                        @name={{if
                          this.selectedChannelMuted
                          "volume-2"
                          "bell-off"
                        }}
                        @size="sm"
                      />
                      <span>
                        {{this.selectedConversationMuteLabel}}
                      </span>
                    </button>
                    {{#if this.selectedChannelIsGroup}}
                      <button
                        type="button"
                        class="communication-header__menu-item"
                        {{on "click" this.openChannelSettings}}
                      >
                        <UiIcon @name="settings" @size="sm" />
                        <span>Channel settings</span>
                      </button>
                      <button
                        type="button"
                        class="communication-header__menu-item --danger"
                        {{on "click" this.leaveSelectedChannel}}
                      >
                        <UiIcon @name="log-out" @size="sm" />
                        <span>Leave channel</span>
                      </button>
                    {{/if}}
                    {{#if this.channelActionError}}
                      <p class="communication-header__menu-error margin-zero">
                        {{this.channelActionError}}
                      </p>
                    {{/if}}
                  </div>
                {{/if}}
              </div>
            {{else}}
              <UiIcon class="margin-left-auto" @name="dots-vertical" />
            {{/if}}
          </header>

          <div
            class="communication-thread layout-vertical --gap-sm --padding-xl"
            {{this.registerThread this.selectedChannelId}}
            {{on "scroll" this.onThreadScroll}}
          >
            {{#each this.messageItems as |item|}}
              {{#if (eq item.type "divider")}}
                <div class="communication-time-divider">
                  <span>{{item.label}}</span>
                </div>
              {{else}}
                {{#if item.message}}
                  {{#let item.message as |message|}}
                    <article
                      class="communication-message
                        {{if (this.isOwnMessage message) '--own'}}
                        {{if item.isGrouped '--grouped'}}
                        {{if
                          (this.messageHasOnlyImageAttachments message)
                          '--image-only'
                        }}"
                    >
                      {{#unless (this.isOwnMessage message)}}
                        {{#if item.showMeta}}
                          <UiAvatar
                            @model={{this.memberFor message.senderId}}
                            @size="sm"
                          />
                        {{else}}
                          <span
                            class="communication-message__avatar-spacer"
                          ></span>
                        {{/if}}
                      {{/unless}}
                      <div
                        class="communication-message__body layout-vertical --gap-sm"
                      >
                        {{#if item.showMeta}}
                          {{#unless (this.isOwnMessage message)}}
                            <div class="layout-horizontal --gap-sm">
                              <strong>{{this.memberName
                                  message.senderId
                                }}</strong>
                              <span
                                class="font-size-text-sm font-color-text-muted"
                              >{{this.formatTime message.createdAt}}</span>
                            </div>
                          {{/unless}}
                        {{/if}}
                        {{#if message.content}}
                          <p class="margin-zero">{{message.content}}</p>
                        {{/if}}
                        {{#each message.attachments as |attachment|}}
                          {{#if (this.isImageAttachment attachment)}}
                            <button
                              type="button"
                              class="communication-image-attachment"
                              {{on
                                "click"
                                (fn
                                  this.openImagePreview
                                  (this.filePreviewUrl attachment)
                                  attachment.file.originalName
                                )
                              }}
                            >
                              <img
                                src={{this.filePreviewUrl attachment}}
                                alt={{attachment.file.originalName}}
                                {{on "load" this.onAttachmentImageLoad}}
                              />
                            </button>
                          {{else}}
                            <a
                              class="communication-attachment layout-horizontal --gap-sm"
                              href={{this.fileDownloadUrl attachment}}
                            >
                              <UiIcon @name="file-text" />
                              <span class="communication-attachment__copy">
                                <strong
                                >{{attachment.file.originalName}}</strong>
                                <small>{{this.formatFileSize
                                    attachment.file.size
                                  }}</small>
                              </span>
                              <UiIcon @name="download" />
                            </a>
                          {{/if}}
                        {{/each}}
                      </div>
                    </article>
                  {{/let}}
                {{/if}}
              {{/if}}
            {{/each}}
          </div>

          <footer class="communication-composer">
            {{#if this.typingIndicatorText}}
              <div
                class="communication-typing-indicator layout-horizontal --gap-sm"
              >
                <span class="communication-typing-indicator__dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </span>
                <span>{{this.typingIndicatorText}}</span>
              </div>
            {{/if}}

            {{#if this.selectedFile}}
              <div
                class="communication-draft-attachment communication-attachment layout-horizontal --gap-sm"
              >
                {{#if this.selectedFileIsImage}}
                  <button
                    type="button"
                    class="communication-draft-attachment__preview"
                    {{on
                      "click"
                      (fn
                        this.openImagePreview
                        this.selectedFilePreviewUrl
                        this.selectedFile.name
                      )
                    }}
                  >
                    <img
                      src={{this.selectedFilePreviewUrl}}
                      alt={{this.selectedFile.name}}
                    />
                  </button>
                {{else}}
                  <UiIcon @name="file-text" />
                {{/if}}
                <span class="communication-attachment__copy">
                  <strong>{{this.selectedFile.name}}</strong>
                  <small>{{this.formatFileSize this.selectedFile.size}}</small>
                </span>
                <button
                  type="button"
                  class="communication-draft-attachment__remove"
                  {{on "click" this.clearSelectedFile}}
                  aria-label="Remove attachment"
                >
                  <UiIcon @name="x" @size="sm" />
                </button>
              </div>
            {{/if}}
            <input
              class="communication-composer__file"
              type="file"
              aria-label="Attach file"
              {{on "change" this.updateSelectedFile}}
            />
            <button
              type="button"
              class="communication-composer__icon"
              {{on "click" this.openFilePicker}}
              aria-label="Attach file"
            >
              <UiIcon @name="paperclip" />
            </button>
            <UiInput
              class="communication-composer__input"
              @value={{this.draft}}
              @placeholder={{this.composerPlaceholder}}
              @onInput={{this.updateDraft}}
              @rightIconButton={{hash
                iconName="send"
                iconVariant="primary"
                onClick=this.sendMessage
              }}
              {{on "keydown" this.sendOnEnter}}
            />
            {{#if this.errorMessage}}
              <div
                class="communication-composer__error"
              >{{this.errorMessage}}</div>
            {{/if}}
          </footer>
        </main>
      {{else}}
        <main class="communication-empty-state layout-vertical --gap-md">
          <div class="communication-empty-state__icon">
            <UiIcon @name="send" @size="lg" />
          </div>
          <h2 class="margin-zero">Your Messages</h2>
          <p class="margin-zero">
            Send private messages to your teammates. Select a person from the
            list to start chatting.
          </p>
        </main>
      {{/if}}

      {{#if this.imagePreviewUrl}}
        <div
          class="communication-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
        >
          <button
            type="button"
            class="communication-lightbox__close"
            {{on "click" this.closeImagePreview}}
            aria-label="Close preview"
          >
            <UiIcon @name="x" @size="lg" />
          </button>
          <img
            class="communication-lightbox__image"
            src={{this.imagePreviewUrl}}
            alt={{this.imagePreviewAlt}}
          />
        </div>
      {{/if}}

      {{#if this.isChannelSettingsOpen}}
        <div
          class="communication-settings-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Channel settings"
        >
          <div
            class="communication-settings-modal__panel layout-vertical --gap-lg"
          >
            <div class="layout-horizontal --gap-md">
              <div class="layout-vertical --gap-xs">
                <h2 class="margin-zero">Channel settings</h2>
                <p class="margin-zero font-color-text-secondary">
                  Rename the channel or add teammates.
                </p>
              </div>
              <UiIconButton
                class="margin-left-auto"
                @iconName="x"
                @onClick={{this.closeChannelSettings}}
                aria-label="Close channel settings"
              />
            </div>

            <div class="layout-vertical --gap-sm">
              <label class="font-weight-bold" for="communication-channel-name">
                Channel name
              </label>
              <UiInput
                id="communication-channel-name"
                @value={{this.settingsChannelName}}
                @placeholder="Channel name"
                @onInput={{this.updateSettingsChannelName}}
              />
            </div>

            <div class="layout-vertical --gap-sm">
              <h3 class="margin-zero">Add members</h3>
              <div class="communication-settings-modal__members">
                {{#each this.settingsAvailableMembers as |member|}}
                  <UiCheckbox
                    class="communication-settings-modal__member"
                    @checked={{this.isSettingsMemberChecked member}}
                    @disabled={{this.isSettingsMemberAlreadyInChannel member}}
                    @onChange={{fn this.toggleSettingsMember member}}
                  >
                    <span class="layout-horizontal --gap-sm">
                      <UiAvatar @model={{member}} @size="sm" />
                      <span class="layout-vertical --gap-xs">
                        <strong>{{member.fullName}}</strong>
                        <small class="font-color-text-secondary">
                          @{{member.username}}
                        </small>
                      </span>
                    </span>
                  </UiCheckbox>
                {{/each}}
              </div>
            </div>

            <UiContainer
              @title="Danger Zone"
              @variant="error"
              @bordered={{true}}
            >
              <div
                class="communication-settings-modal__danger layout-horizontal --gap-md"
              >
                <p class="margin-zero font-color-text-secondary">
                  Delete this channel and all of its messages permanently.
                </p>
                <UiButton
                  class="margin-left-auto"
                  @hierarchy="secondary"
                  @iconLeft="trash"
                  @text="Delete Channel"
                  @loading={{this.isDeletingChannel}}
                  @onClick={{this.deleteSelectedChannel}}
                />
              </div>
            </UiContainer>

            {{#if this.channelActionError}}
              <p class="communication-settings-modal__error margin-zero">
                {{this.channelActionError}}
              </p>
            {{/if}}

            <div class="layout-horizontal --gap-sm">
              <UiButton
                class="margin-left-auto"
                @hierarchy="tertiary"
                @text="Cancel"
                @onClick={{this.closeChannelSettings}}
              />
              <UiButton
                @text="Save changes"
                @loading={{this.isUpdatingChannel}}
                @onClick={{this.saveChannelSettings}}
              />
            </div>
          </div>
        </div>
      {{/if}}
    </section>
  </template>
}

function parseChannel(payload: unknown): CommunicationChannel {
  if (!isJsonApiDocument(payload)) {
    const raw = payload as {
      id: number;
      workspaceId: number;
      type: 'DIRECT' | 'GROUP';
      name?: string;
      updatedAt?: string;
      members?: Array<{ userId: number; mutedAt?: string | null }>;
    };

    return {
      id: Number(raw.id),
      workspaceId: Number(raw.workspaceId),
      type: raw.type,
      name: raw.name,
      updatedAt: raw.updatedAt,
      members: (raw.members ?? []).map((member) => ({
        userId: Number(member.userId),
        mutedAt: member.mutedAt,
      })),
      messages: [],
    };
  }

  const included = new Map(
    (payload.included ?? []).map((resource) => [
      `${resource.type}:${resource.id}`,
      resource,
    ])
  );
  const memberRefs = asResourceIdentifierArray(
    payload.data.relationships?.members?.data
  );

  return {
    id: Number(payload.data.id),
    workspaceId: Number(payload.data.attributes?.workspaceId),
    type: payload.data.attributes?.type as 'DIRECT' | 'GROUP',
    name: payload.data.attributes?.name as string | undefined,
    updatedAt: payload.data.attributes?.updatedAt as string | undefined,
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

function parseChannelMember(payload: unknown): {
  userId: number;
  mutedAt?: string | null;
} {
  if (!isJsonApiDocument(payload)) {
    const raw = payload as { userId: number; mutedAt?: string | null };

    return {
      userId: Number(raw.userId),
      mutedAt: raw.mutedAt,
    };
  }

  return {
    userId: Number(payload.data.attributes?.userId),
    mutedAt: payload.data.attributes?.mutedAt as string | null | undefined,
  };
}

function asResourceIdentifierArray(
  value: unknown
): Array<{ id: string; type: string }> {
  if (!value) return [];
  return Array.isArray(value)
    ? (value as Array<{ id: string; type: string }>)
    : [value as { id: string; type: string }];
}

function isJsonApiDocument(value: unknown): value is JsonApiDocument {
  return value !== null && typeof value === 'object' && 'data' in value;
}
