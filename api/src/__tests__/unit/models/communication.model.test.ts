import {describe, expect, it} from 'vitest';

import {
  Channel,
  ChannelMember,
  ChannelMemberWithRelations,
  ChannelWithRelations,
  Message,
  MessageAttachment,
  MessageAttachmentWithRelations,
  MessageWithRelations,
  User,
  File,
  Workspace,
} from '../../../models';

describe('Communication models (unit)', () => {
  it('constructs channels with workspace, creator, member, and message relations', () => {
    const channel: ChannelWithRelations = new Channel({
      id: 20,
      workspaceId: 3,
      createdById: 10,
      type: 'GROUP',
      name: 'general',
      directKey: undefined,
      createdAt: '2026-04-27T08:00:00.000Z',
      updatedAt: '2026-04-27T09:00:00.000Z',
    });

    channel.workspace = new Workspace({id: 3, name: 'DevTeams', ownerId: 10});
    channel.createdBy = new User({id: 10, username: 'aron0228'});
    channel.members = [new ChannelMember({id: 1, channelId: 20, userId: 10})];
    channel.messages = [
      new Message({id: 44, channelId: 20, senderId: 10, content: 'hello'}),
    ];

    expect(channel.toJSON()).toMatchObject({
      id: 20,
      workspaceId: 3,
      createdById: 10,
      type: 'GROUP',
      name: 'general',
      createdAt: '2026-04-27T08:00:00.000Z',
      updatedAt: '2026-04-27T09:00:00.000Z',
    });
    expect(channel.workspace?.name).toBe('DevTeams');
    expect(channel.createdBy?.username).toBe('aron0228');
    expect(channel.members).toHaveLength(1);
    expect(channel.messages).toHaveLength(1);
  });

  it('constructs direct channels with deterministic keys', () => {
    const channel = new Channel({
      workspaceId: 3,
      createdById: 10,
      type: 'DIRECT',
      directKey: '3:10:11',
    });

    expect(channel.type).toBe('DIRECT');
    expect(channel.directKey).toBe('3:10:11');
    expect(channel.name).toBeUndefined();
  });

  it('constructs channel members with read and mute timestamps', () => {
    const member: ChannelMemberWithRelations = new ChannelMember({
      id: 2,
      channelId: 20,
      userId: 11,
      lastReadAt: '2026-04-27T10:00:00.000Z',
      mutedAt: '2026-04-27T11:00:00.000Z',
      createdAt: '2026-04-27T08:00:00.000Z',
    });

    member.channel = new Channel({
      id: 20,
      workspaceId: 3,
      createdById: 10,
      type: 'GROUP',
      name: 'general',
    });
    member.user = new User({id: 11, username: 'teammate'});

    expect(member.toJSON()).toMatchObject({
      id: 2,
      channelId: 20,
      userId: 11,
      lastReadAt: '2026-04-27T10:00:00.000Z',
      mutedAt: '2026-04-27T11:00:00.000Z',
      createdAt: '2026-04-27T08:00:00.000Z',
    });
    expect(member.channel?.name).toBe('general');
    expect(member.user?.username).toBe('teammate');
  });

  it('allows channel members to be explicitly unmuted', () => {
    const member = new ChannelMember({
      channelId: 20,
      userId: 11,
      mutedAt: null,
    });

    expect(member.mutedAt).toBeNull();
  });

  it('constructs messages with sender, channel, and attachment relations', () => {
    const message: MessageWithRelations = new Message({
      id: 44,
      channelId: 20,
      senderId: 10,
      content: 'hello',
      createdAt: '2026-04-27T08:00:00.000Z',
      updatedAt: '2026-04-27T09:00:00.000Z',
    });

    message.channel = new Channel({
      id: 20,
      workspaceId: 3,
      createdById: 10,
      type: 'GROUP',
      name: 'general',
    });
    message.sender = new User({id: 10, username: 'aron0228'});
    message.attachments = [
      new MessageAttachment({id: 8, messageId: 44, fileId: 90}),
    ];

    expect(message.toJSON()).toMatchObject({
      id: 44,
      channelId: 20,
      senderId: 10,
      content: 'hello',
      createdAt: '2026-04-27T08:00:00.000Z',
      updatedAt: '2026-04-27T09:00:00.000Z',
    });
    expect(message.channel?.name).toBe('general');
    expect(message.sender?.username).toBe('aron0228');
    expect(message.attachments).toHaveLength(1);
  });

  it('constructs attachment joins with file and message relations', () => {
    const attachment: MessageAttachmentWithRelations = new MessageAttachment({
      id: 8,
      messageId: 44,
      fileId: 90,
    });

    attachment.message = new Message({
      id: 44,
      channelId: 20,
      senderId: 10,
      content: 'hello',
    });
    attachment.file = new File({
      id: 90,
      workspaceId: 3,
      originalName: 'mockup.png',
      mimeType: 'image/png',
      size: 2048,
      path: 'uploads/mockup.png',
    });

    expect(attachment.toJSON()).toMatchObject({
      id: 8,
      messageId: 44,
      fileId: 90,
    });
    expect(attachment.message?.content).toBe('hello');
    expect(attachment.file?.originalName).toBe('mockup.png');
  });
});
