import {injectable, BindingScope} from '@loopback/core';
import {Filter, repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {Channel, ChannelMember, Message, MessageAttachment} from '../models';
import {
  ChannelMemberRepository,
  ChannelRepository,
  FileRepository,
  MessageAttachmentRepository,
  MessageRepository,
  WorkspaceMemberRepository,
  WorkspaceRepository,
} from '../repositories';

export interface CreateGroupChannelData {
  workspaceId: number;
  name: string;
  memberIds?: number[];
}

export interface SendMessageData {
  channelId: number;
  senderId: number;
  content?: string;
  attachmentIds?: number[];
}

export interface UpdateGroupChannelData {
  name: string;
}

export interface UpdateChannelMuteData {
  muted: boolean;
}

@injectable({scope: BindingScope.SINGLETON})
export class CommunicationService {
  constructor(
    @repository(ChannelRepository)
    private channelRepository: ChannelRepository,
    @repository(ChannelMemberRepository)
    private channelMemberRepository: ChannelMemberRepository,
    @repository(MessageRepository)
    private messageRepository: MessageRepository,
    @repository(MessageAttachmentRepository)
    private messageAttachmentRepository: MessageAttachmentRepository,
    @repository(WorkspaceMemberRepository)
    private workspaceMemberRepository: WorkspaceMemberRepository,
    @repository(WorkspaceRepository)
    private workspaceRepository: WorkspaceRepository,
    @repository(FileRepository)
    private fileRepository: FileRepository,
  ) {}

  async listChannels(workspaceId: number, userId: number): Promise<Channel[]> {
    await this.assertWorkspaceMember(workspaceId, userId);

    const memberships = await this.channelMemberRepository.find({
      where: {userId},
    });
    const channelIds = memberships.map(membership => membership.channelId);

    if (channelIds.length === 0) return [];

    return this.channelRepository.find({
      where: {workspaceId, id: {inq: channelIds}},
      include: [
        {relation: 'members'},
        {
          relation: 'messages',
          scope: {
            include: [
              {relation: 'sender'},
              {relation: 'attachments', scope: {include: [{relation: 'file'}]}},
            ],
            order: ['createdAt ASC'],
          },
        },
      ],
      order: ['updatedAt DESC'],
    });
  }

  async createGroupChannel(
    data: CreateGroupChannelData,
    creatorId: number,
  ): Promise<Channel> {
    await this.assertWorkspaceMember(data.workspaceId, creatorId);

    const channel = await this.channelRepository.create({
      workspaceId: data.workspaceId,
      createdById: creatorId,
      type: 'GROUP',
      name: data.name,
    });

    const memberIds = new Set([creatorId, ...(data.memberIds ?? [])]);
    for (const memberId of memberIds) {
      await this.assertWorkspaceMember(data.workspaceId, memberId);
      await this.createMemberIfMissing(channel.id, memberId);
    }

    return this.channelRepository.findById(channel.id, {
      include: [{relation: 'members'}],
    });
  }

  async findOrCreateDirectChannel(
    workspaceId: number,
    userId: number,
    participantId: number,
  ): Promise<Channel> {
    if (userId === participantId) {
      throw new HttpErrors.BadRequest(
        'Cannot create a direct channel with self.',
      );
    }

    await this.assertWorkspaceMember(workspaceId, userId);
    await this.assertWorkspaceMember(workspaceId, participantId);

    const directKey = this.buildDirectKey(workspaceId, userId, participantId);
    const existing = await this.channelRepository.findOne({
      where: {workspaceId, type: 'DIRECT', directKey},
      include: [{relation: 'members'}],
    });

    if (existing) return existing;

    const channel = await this.channelRepository.create({
      workspaceId,
      createdById: userId,
      type: 'DIRECT',
      directKey,
    });

    await this.createMemberIfMissing(channel.id, userId);
    await this.createMemberIfMissing(channel.id, participantId);

    return this.channelRepository.findById(channel.id, {
      include: [{relation: 'members'}],
    });
  }

  async addMember(
    channelId: number,
    userId: number,
    requesterId: number,
  ): Promise<ChannelMember> {
    const channel = await this.channelRepository.findById(channelId);
    await this.assertChannelMember(channelId, requesterId);
    this.assertGroupChannel(channel);
    await this.assertWorkspaceMember(channel.workspaceId, userId);

    const existing = await this.channelMemberRepository.findOne({
      where: {channelId, userId},
    });

    if (existing) return existing;

    return this.createMemberIfMissing(channelId, userId);
  }

  async updateGroupChannel(
    channelId: number,
    requesterId: number,
    data: UpdateGroupChannelData,
  ): Promise<Channel> {
    const channel = await this.channelRepository.findById(channelId);
    await this.assertChannelMember(channelId, requesterId);
    this.assertGroupChannel(channel);

    const name = data.name.trim();
    if (!name) {
      throw new HttpErrors.BadRequest('Channel name is required.');
    }

    await this.channelRepository.updateById(channelId, {
      name,
      updatedAt: new Date().toISOString(),
    });

    return this.channelRepository.findById(channelId, {
      include: [{relation: 'members'}],
    });
  }

  async leaveGroupChannel(
    channelId: number,
    requesterId: number,
  ): Promise<void> {
    const channel = await this.channelRepository.findById(channelId);
    const membership = await this.channelMemberRepository.findOne({
      where: {channelId, userId: requesterId},
    });

    if (!membership) {
      throw new HttpErrors.Forbidden('You are not a member of this channel.');
    }

    this.assertGroupChannel(channel);
    await this.channelMemberRepository.deleteById(membership.id);

    const remainingMembers = await this.channelMemberRepository.find({
      where: {channelId},
    });

    if (remainingMembers.length === 0) {
      await this.channelRepository.deleteById(channelId);
    }
  }

  async deleteGroupChannel(
    channelId: number,
    requesterId: number,
  ): Promise<void> {
    const channel = await this.channelRepository.findById(channelId);
    await this.assertChannelMember(channelId, requesterId);
    this.assertGroupChannel(channel);

    await this.channelRepository.deleteById(channelId);
  }

  async updateChannelMute(
    channelId: number,
    requesterId: number,
    data: UpdateChannelMuteData,
  ): Promise<ChannelMember> {
    const membership = await this.channelMemberRepository.findOne({
      where: {channelId, userId: requesterId},
    });

    if (!membership) {
      throw new HttpErrors.Forbidden('You are not a member of this channel.');
    }

    const mutedAt = data.muted ? new Date().toISOString() : null;
    await this.channelMemberRepository.updateById(membership.id, {mutedAt});

    return this.channelMemberRepository.findById(membership.id);
  }

  async listMessages(
    channelId: number,
    userId: number,
    filter?: Filter<Message>,
  ): Promise<Message[]> {
    await this.assertChannelMember(channelId, userId);

    return this.messageRepository.find({
      ...filter,
      where: {...filter?.where, channelId},
      include: [
        {relation: 'sender'},
        {relation: 'attachments', scope: {include: [{relation: 'file'}]}},
      ],
      order: filter?.order ?? ['createdAt ASC'],
    });
  }

  async sendMessage(data: SendMessageData): Promise<Message> {
    await this.assertChannelMember(data.channelId, data.senderId);

    const content = data.content?.trim();
    const attachmentIds = data.attachmentIds ?? [];

    if (!content && attachmentIds.length === 0) {
      throw new HttpErrors.BadRequest(
        'Message content or attachment is required.',
      );
    }

    const channel = await this.channelRepository.findById(data.channelId);
    for (const fileId of attachmentIds) {
      const file = await this.fileRepository.findById(fileId);
      if (
        file.workspaceId != null &&
        file.workspaceId !== channel.workspaceId
      ) {
        throw new HttpErrors.BadRequest(
          'Attachment belongs to another workspace.',
        );
      }
    }

    const message = await this.messageRepository.create({
      channelId: data.channelId,
      senderId: data.senderId,
      content,
    });

    for (const fileId of attachmentIds) {
      await this.messageAttachmentRepository.create({
        messageId: message.id,
        fileId,
      });
    }

    await this.channelRepository.updateById(data.channelId, {
      updatedAt: new Date().toISOString(),
    });

    return this.messageRepository.findById(message.id, {
      include: [
        {relation: 'sender'},
        {relation: 'attachments', scope: {include: [{relation: 'file'}]}},
      ],
    });
  }

  async assertChannelMember(channelId: number, userId: number): Promise<void> {
    const membership = await this.channelMemberRepository.findOne({
      where: {channelId, userId},
    });

    if (!membership) {
      throw new HttpErrors.Forbidden('You are not a member of this channel.');
    }
  }

  private async assertWorkspaceMember(
    workspaceId: number,
    userId: number,
  ): Promise<void> {
    const workspace = await this.workspaceRepository.findById(workspaceId);
    if (workspace.ownerId === userId) return;

    const membership = await this.workspaceMemberRepository.findOne({
      where: {workspaceId, userId},
    });

    if (!membership) {
      throw new HttpErrors.Forbidden('You are not a member of this workspace.');
    }
  }

  private buildDirectKey(
    workspaceId: number,
    userId: number,
    participantId: number,
  ): string {
    return [workspaceId, ...[userId, participantId].sort((a, b) => a - b)].join(
      ':',
    );
  }

  private async createMemberIfMissing(
    channelId: number,
    userId: number,
  ): Promise<ChannelMember> {
    const existing = await this.channelMemberRepository.findOne({
      where: {channelId, userId},
    });

    if (existing) return existing;

    return this.channelMemberRepository.create({channelId, userId});
  }

  private assertGroupChannel(channel: Channel): void {
    if (channel.type !== 'GROUP') {
      throw new HttpErrors.BadRequest(
        'This action is only available for group channels.',
      );
    }
  }
}

export type MessageWithAttachments = Message & {
  attachments?: MessageAttachment[];
};
