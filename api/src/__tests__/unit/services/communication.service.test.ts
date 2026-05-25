import {HttpErrors} from '@loopback/rest';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {WORKSPACE_PERMISSION, WORKSPACE_ROLE} from '../../../constants';
import {Message} from '../../../models';
import {CommunicationService} from '../../../services/communication.service';

describe('CommunicationService (unit)', () => {
  let channelRepository: Record<string, ReturnType<typeof vi.fn>>;
  let channelMemberRepository: Record<string, ReturnType<typeof vi.fn>>;
  let messageRepository: Record<string, ReturnType<typeof vi.fn>>;
  let messageAttachmentRepository: Record<string, ReturnType<typeof vi.fn>>;
  let fileRepository: Record<string, ReturnType<typeof vi.fn>>;
  let userRepository: Record<string, ReturnType<typeof vi.fn>>;
  let workspaceRepository: Record<string, ReturnType<typeof vi.fn>>;
  let workspaceMemberRepository: Record<string, ReturnType<typeof vi.fn>>;
  let auditEventService: Record<string, ReturnType<typeof vi.fn>>;
  let workspaceAuthorizationService: Record<string, ReturnType<typeof vi.fn>>;
  let notificationService: Record<string, ReturnType<typeof vi.fn>>;
  let service: CommunicationService;

  beforeEach(() => {
    channelRepository = {
      find: vi.fn(),
      findById: vi.fn(),
      findOne: vi.fn(),
      create: vi.fn(),
      updateById: vi.fn(),
      deleteById: vi.fn(),
    };
    channelMemberRepository = {
      find: vi.fn(),
      findOne: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      deleteById: vi.fn(),
      updateById: vi.fn(),
    };
    messageRepository = {
      find: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
    };
    messageAttachmentRepository = {
      create: vi.fn(),
    };
    fileRepository = {
      findById: vi.fn(),
    };
    userRepository = {
      find: vi.fn(),
    };
    workspaceRepository = {
      findById: vi.fn().mockResolvedValue({id: 3, ownerId: 99}),
    };
    workspaceMemberRepository = {
      find: vi.fn(),
    };
    auditEventService = {
      record: vi.fn().mockResolvedValue(undefined),
    };
    workspaceAuthorizationService = {
      assertPermission: vi.fn().mockResolvedValue(WORKSPACE_ROLE.MEMBER),
      assertWorkspaceMember: vi.fn().mockResolvedValue(WORKSPACE_ROLE.MEMBER),
      getWorkspaceRole: vi.fn().mockResolvedValue(WORKSPACE_ROLE.MEMBER),
    };
    notificationService = {
      create: vi.fn(),
    };

    service = new CommunicationService(
      channelRepository as never,
      channelMemberRepository as never,
      messageRepository as never,
      messageAttachmentRepository as never,
      fileRepository as never,
      userRepository as never,
      workspaceRepository as never,
      workspaceMemberRepository as never,
      auditEventService as never,
      workspaceAuthorizationService as never,
      notificationService as never,
    );
  });

  it('lists only channels where the user is a member', async () => {
    channelMemberRepository.find.mockResolvedValue([
      {channelId: 4},
      {channelId: 7},
    ]);
    channelRepository.find.mockResolvedValue([{id: 7}]);

    await expect(service.listChannels(3, 10)).resolves.toEqual([{id: 7}]);

    expect(workspaceAuthorizationService.assertPermission).toHaveBeenCalledWith(
      3,
      10,
      WORKSPACE_PERMISSION.COMMUNICATION_VIEW,
    );
    expect(channelRepository.find).toHaveBeenCalledWith({
      where: {workspaceId: 3, id: {inq: [4, 7]}},
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
  });

  it('lists direct members with workspace pagination', async () => {
    workspaceMemberRepository.find.mockResolvedValue([
      {
        id: 1,
        userId: 11,
      },
    ]);
    workspaceRepository.findById.mockResolvedValue({id: 3, ownerId: 10});
    userRepository.find.mockResolvedValue([
      {
        id: 11,
        fullName: 'Ada Lovelace',
        username: 'ada',
        avatarUrl: 'avatar.png',
      },
    ]);

    await expect(
      service.listDirectMembers(3, 10, {limit: 25, skip: 50}),
    ).resolves.toEqual([
      {
        id: 1,
        userId: 11,
        fullName: 'Ada Lovelace',
        username: 'ada',
        avatarUrl: 'avatar.png',
      },
    ]);
    expect(workspaceAuthorizationService.assertPermission).toHaveBeenCalledWith(
      3,
      10,
      WORKSPACE_PERMISSION.COMMUNICATION_VIEW,
    );
    expect(workspaceMemberRepository.find).toHaveBeenCalledWith({
      where: {workspaceId: 3, userId: {neq: 10}},
    });
    expect(userRepository.find).toHaveBeenCalledWith({
      where: {
        and: [{id: {inq: [11]}}],
      },
      order: ['fullName ASC', 'username ASC'],
      limit: 25,
      skip: 50,
    });
  });

  it('searches direct members by user fields with pagination', async () => {
    workspaceMemberRepository.find.mockResolvedValue([
      {id: 1, userId: 11},
      {id: 2, userId: 12},
    ]);
    workspaceRepository.findById.mockResolvedValue({id: 3, ownerId: 10});
    userRepository.find.mockResolvedValue([
      {
        id: 12,
        fullName: 'Grace Hopper',
        username: 'grace',
        avatarUrl: 'grace.png',
      },
    ]);

    await expect(
      service.listDirectMembers(3, 10, {search: 'grace', limit: 10, skip: 20}),
    ).resolves.toEqual([
      {
        id: 2,
        userId: 12,
        fullName: 'Grace Hopper',
        username: 'grace',
        avatarUrl: 'grace.png',
      },
    ]);
    expect(userRepository.find).toHaveBeenCalledWith({
      where: {
        and: [
          {id: {inq: [11, 12]}},
          {
            or: [
              {fullName: {ilike: '%grace%'}},
              {username: {ilike: '%grace%'}},
              {email: {ilike: '%grace%'}},
            ],
          },
        ],
      },
      order: ['fullName ASC', 'username ASC'],
      limit: 10,
      skip: 20,
    });
  });

  it('includes the workspace owner when a member searches direct-message targets', async () => {
    workspaceMemberRepository.find.mockResolvedValue([
      {id: 2, userId: undefined},
    ]);
    workspaceRepository.findById.mockResolvedValue({id: 3, ownerId: 99});
    userRepository.find.mockResolvedValue([
      {
        id: 99,
        fullName: 'Workspace Owner',
        username: 'owner',
        avatarUrl: undefined,
      },
    ]);

    await expect(service.listDirectMembers(3, 10)).resolves.toEqual([
      {
        id: 99,
        userId: 99,
        fullName: 'Workspace Owner',
        username: 'owner',
        avatarUrl: undefined,
      },
    ]);

    expect(userRepository.find).toHaveBeenCalledWith({
      where: {
        and: [{id: {inq: [99]}}],
      },
      order: ['fullName ASC', 'username ASC'],
      limit: 25,
      skip: 0,
    });
  });

  it('returns no direct-message targets when the workspace has no other users', async () => {
    workspaceMemberRepository.find.mockResolvedValue([]);
    workspaceRepository.findById.mockResolvedValue({id: 3, ownerId: 10});

    await expect(service.listDirectMembers(3, 10)).resolves.toEqual([]);

    expect(userRepository.find).not.toHaveBeenCalled();
  });

  it('creates a group channel and adds unique workspace members', async () => {
    channelRepository.create.mockResolvedValue({id: 20});
    channelRepository.findById.mockResolvedValue({id: 20, members: []});
    channelMemberRepository.findOne.mockResolvedValue(null);
    channelMemberRepository.create.mockImplementation(data =>
      Promise.resolve({id: data.userId, ...data}),
    );

    await expect(
      service.createGroupChannel(
        {workspaceId: 3, name: 'general', memberIds: [11, 12, 11]},
        10,
      ),
    ).resolves.toEqual({id: 20, members: []});

    expect(channelRepository.create).toHaveBeenCalledWith({
      workspaceId: 3,
      createdById: 10,
      type: 'GROUP',
      name: 'general',
    });
    expect(workspaceAuthorizationService.assertPermission).toHaveBeenCalledWith(
      3,
      10,
      WORKSPACE_PERMISSION.COMMUNICATION_MANAGE,
    );
    expect(channelMemberRepository.create).toHaveBeenCalledTimes(3);
    expect(channelMemberRepository.create).toHaveBeenCalledWith({
      channelId: 20,
      userId: 10,
      role: 'ADMIN',
    });
    expect(auditEventService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 10,
        workspaceId: 3,
        action: 'communication.channel.created',
        resourceType: 'communication-channel',
        resourceId: '20',
        payload: {name: 'general', memberIds: [10, 11, 12]},
      }),
    );
  });

  it('reuses an existing direct channel', async () => {
    channelRepository.findOne.mockResolvedValue({id: 30, directKey: '3:10:11'});

    await expect(service.findOrCreateDirectChannel(3, 10, 11)).resolves.toEqual(
      {id: 30, directKey: '3:10:11'},
    );

    expect(channelRepository.create).not.toHaveBeenCalled();
  });

  it('creates a direct channel with a deterministic direct key', async () => {
    channelRepository.findOne.mockResolvedValue(null);
    channelRepository.create.mockResolvedValue({id: 31});
    channelRepository.findById.mockResolvedValue({id: 31, members: []});
    channelMemberRepository.findOne.mockResolvedValue(null);
    channelMemberRepository.create.mockResolvedValue({});

    await service.findOrCreateDirectChannel(3, 11, 10);

    expect(channelRepository.create).toHaveBeenCalledWith({
      workspaceId: 3,
      createdById: 11,
      type: 'DIRECT',
      directKey: '3:10:11',
    });
  });

  it('rejects direct channels to self', async () => {
    await expect(
      service.findOrCreateDirectChannel(3, 10, 10),
    ).rejects.toBeInstanceOf(HttpErrors.BadRequest);
  });

  it('sends a message with attachments', async () => {
    channelMemberRepository.findOne.mockResolvedValue({id: 1});
    channelRepository.findById.mockResolvedValue({id: 20, workspaceId: 3});
    fileRepository.findById.mockResolvedValue({id: 90, workspaceId: 3});
    messageRepository.create.mockResolvedValue({id: 44});
    messageRepository.findById.mockResolvedValue({
      id: 44,
      content: 'hello',
      attachments: [{fileId: 90}],
    });

    await expect(
      service.sendMessage({
        channelId: 20,
        senderId: 10,
        content: ' hello ',
        attachmentIds: [90],
      }),
    ).resolves.toEqual({id: 44, content: 'hello', attachments: [{fileId: 90}]});

    expect(messageRepository.create).toHaveBeenCalledWith({
      channelId: 20,
      senderId: 10,
      content: 'hello',
    });
    expect(messageAttachmentRepository.create).toHaveBeenCalledWith({
      messageId: 44,
      fileId: 90,
    });
    expect(channelRepository.updateById).toHaveBeenCalledWith(20, {
      updatedAt: expect.any(String),
    });
  });

  it('rejects empty messages and cross-workspace attachments', async () => {
    channelMemberRepository.findOne.mockResolvedValue({id: 1});
    await expect(
      service.sendMessage({channelId: 20, senderId: 10, content: '   '}),
    ).rejects.toBeInstanceOf(HttpErrors.BadRequest);

    channelRepository.findById.mockResolvedValue({id: 20, workspaceId: 3});
    fileRepository.findById.mockResolvedValue({id: 90, workspaceId: 4});

    await expect(
      service.sendMessage({channelId: 20, senderId: 10, attachmentIds: [90]}),
    ).rejects.toBeInstanceOf(HttpErrors.BadRequest);
  });

  it('requires channel membership before reading messages', async () => {
    channelMemberRepository.findOne.mockResolvedValue(null);

    await expect(service.listMessages(20, 10)).rejects.toBeInstanceOf(
      HttpErrors.Forbidden,
    );
  });

  it('adds members after validating requester and workspace membership', async () => {
    workspaceAuthorizationService.getWorkspaceRole.mockResolvedValue(
      WORKSPACE_ROLE.ADMIN,
    );
    channelRepository.findById.mockResolvedValue({
      id: 20,
      workspaceId: 3,
      type: 'GROUP',
    });
    channelMemberRepository.findOne.mockResolvedValue(null);
    channelMemberRepository.create.mockResolvedValue({
      id: 2,
      channelId: 20,
      userId: 11,
    });

    await expect(service.addMember(20, 11, 10)).resolves.toEqual({
      id: 2,
      channelId: 20,
      userId: 11,
    });
    expect(auditEventService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 10,
        workspaceId: 3,
        action: 'communication.channel.member.added',
        resourceId: '20',
        payload: {memberUserId: 11},
      }),
    );
  });

  it('renames group channels and returns the updated channel', async () => {
    workspaceAuthorizationService.getWorkspaceRole.mockResolvedValue(
      WORKSPACE_ROLE.ADMIN,
    );
    channelRepository.findById
      .mockResolvedValueOnce({id: 20, workspaceId: 3, type: 'GROUP'})
      .mockResolvedValueOnce({id: 20, type: 'GROUP', name: 'product'});

    await expect(
      service.updateGroupChannel(20, 10, {name: ' product '}),
    ).resolves.toEqual({id: 20, type: 'GROUP', name: 'product'});

    expect(channelRepository.updateById).toHaveBeenCalledWith(20, {
      name: 'product',
      updatedAt: expect.any(String),
    });
    expect(auditEventService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'communication.channel.updated',
        payload: {changedFields: ['name'], name: 'product'},
      }),
    );
  });

  it('rejects blank group channel names', async () => {
    workspaceAuthorizationService.getWorkspaceRole.mockResolvedValue(
      WORKSPACE_ROLE.ADMIN,
    );
    channelRepository.findById.mockResolvedValue({
      id: 20,
      workspaceId: 3,
      type: 'GROUP',
    });

    await expect(
      service.updateGroupChannel(20, 10, {name: '   '}),
    ).rejects.toBeInstanceOf(HttpErrors.BadRequest);

    expect(channelRepository.updateById).not.toHaveBeenCalled();
  });

  it('rejects group channel actions for direct channels', async () => {
    channelRepository.findById.mockResolvedValue({
      id: 20,
      workspaceId: 3,
      type: 'DIRECT',
    });
    channelMemberRepository.findOne.mockResolvedValue({
      id: 1,
      channelId: 20,
      userId: 10,
    });

    await expect(
      service.updateGroupChannel(20, 10, {name: 'product'}),
    ).rejects.toBeInstanceOf(HttpErrors.BadRequest);
    await expect(service.deleteGroupChannel(20, 10)).rejects.toBeInstanceOf(
      HttpErrors.BadRequest,
    );
  });

  it('lets members leave group channels and deletes empty groups', async () => {
    channelRepository.findById.mockResolvedValue({
      id: 20,
      workspaceId: 3,
      type: 'GROUP',
    });
    channelMemberRepository.findOne.mockResolvedValue({
      id: 4,
      channelId: 20,
      userId: 10,
    });
    channelMemberRepository.find.mockResolvedValue([]);

    await expect(service.leaveGroupChannel(20, 10)).resolves.toBeUndefined();

    expect(channelMemberRepository.deleteById).toHaveBeenCalledWith(4);
    expect(channelRepository.deleteById).toHaveBeenCalledWith(20);
    expect(auditEventService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'communication.channel.deleted',
        payload: {reason: 'last-member-left', name: undefined},
      }),
    );
  });

  it('audits group channel leaves when other members remain', async () => {
    channelRepository.findById.mockResolvedValue({
      id: 20,
      workspaceId: 3,
      type: 'GROUP',
    });
    channelMemberRepository.findOne.mockResolvedValue({
      id: 4,
      channelId: 20,
      userId: 10,
    });
    channelMemberRepository.find.mockResolvedValue([{id: 5, userId: 11}]);

    await expect(service.leaveGroupChannel(20, 10)).resolves.toBeUndefined();

    expect(channelRepository.deleteById).not.toHaveBeenCalled();
    expect(auditEventService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'communication.channel.member.left',
        resourceId: '20',
      }),
    );
  });

  it('deletes group channels when requested by a member', async () => {
    workspaceAuthorizationService.getWorkspaceRole.mockResolvedValue(
      WORKSPACE_ROLE.ADMIN,
    );
    channelRepository.findById.mockResolvedValue({
      id: 20,
      workspaceId: 3,
      type: 'GROUP',
    });

    await expect(service.deleteGroupChannel(20, 10)).resolves.toBeUndefined();

    expect(channelRepository.deleteById).toHaveBeenCalledWith(20);
    expect(auditEventService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'communication.channel.deleted',
        resourceId: '20',
      }),
    );
  });

  it('updates a channel mute preference for the requester membership', async () => {
    channelMemberRepository.findOne.mockResolvedValue({
      id: 4,
      channelId: 20,
      userId: 10,
    });
    channelMemberRepository.findById.mockResolvedValue({
      id: 4,
      channelId: 20,
      userId: 10,
      mutedAt: 'now',
    });

    await expect(
      service.updateChannelMute(20, 10, {muted: true}),
    ).resolves.toEqual({
      id: 4,
      channelId: 20,
      userId: 10,
      mutedAt: 'now',
    });

    expect(channelMemberRepository.updateById).toHaveBeenCalledWith(4, {
      mutedAt: expect.any(String),
    });
  });

  it('clears a channel mute preference', async () => {
    channelMemberRepository.findOne.mockResolvedValue({
      id: 4,
      channelId: 20,
      userId: 10,
      mutedAt: '2026-04-28T12:00:00.000Z',
    });
    channelMemberRepository.findById.mockResolvedValue({
      id: 4,
      channelId: 20,
      userId: 10,
      mutedAt: null,
    });

    await expect(
      service.updateChannelMute(20, 10, {muted: false}),
    ).resolves.toEqual({
      id: 4,
      channelId: 20,
      userId: 10,
      mutedAt: null,
    });

    expect(channelMemberRepository.updateById).toHaveBeenCalledWith(4, {
      mutedAt: null,
    });
  });

  it('rejects channel mute updates from non-members', async () => {
    channelMemberRepository.findOne.mockResolvedValue(null);

    await expect(
      service.updateChannelMute(20, 10, {muted: true}),
    ).rejects.toBeInstanceOf(HttpErrors.Forbidden);

    expect(channelMemberRepository.updateById).not.toHaveBeenCalled();
  });

  it('lists messages with sender and attachment file inclusions', async () => {
    channelMemberRepository.findOne.mockResolvedValue({id: 1});
    messageRepository.find.mockResolvedValue([{id: 50}]);

    await expect(
      service.listMessages(20, 10, {where: {senderId: 10}, limit: 20}),
    ).resolves.toEqual([{id: 50}]);

    expect(messageRepository.find).toHaveBeenCalledWith({
      where: {senderId: 10, channelId: 20},
      limit: 20,
      include: [
        {relation: 'sender'},
        {relation: 'attachments', scope: {include: [{relation: 'file'}]}},
      ],
      order: ['createdAt ASC'],
    });
  });

  it('creates message notifications for unmuted recipients', async () => {
    channelRepository.findById.mockResolvedValue({
      id: 20,
      workspaceId: 3,
      type: 'GROUP',
      name: 'general',
      members: [{userId: 10}, {userId: 11}, {userId: 12, mutedAt: 'now'}],
    });
    notificationService.create.mockResolvedValue({
      id: 91,
      userId: 11,
      type: 'communication-message',
    });

    await expect(
      service.createMessageNotifications(
        20,
        Object.assign(
          new Message({
            id: 44,
            channelId: 20,
            senderId: 10,
            content: ' hello ',
          }),
          {sender: {fullName: 'Ada Lovelace'}},
        ),
        10,
      ),
    ).resolves.toEqual([{id: 91, userId: 11, type: 'communication-message'}]);

    expect(notificationService.create).toHaveBeenCalledTimes(1);
    expect(notificationService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 11,
        workspaceId: 3,
        type: 'communication-message',
        title: 'Ada Lovelace in #general',
        message: 'hello',
        targetRoute: 'workspaces.edit.communication',
        payload: expect.objectContaining({
          workspaceId: 3,
          channelId: 20,
          messageId: 44,
          senderId: 10,
          channelType: 'GROUP',
          channelName: 'general',
        }),
      }),
    );
  });

  it('uses attachment text for direct-message notifications without content', async () => {
    channelRepository.findById.mockResolvedValue({
      id: 20,
      workspaceId: 3,
      type: 'DIRECT',
      members: [{userId: 10}, {userId: 11}],
    });
    notificationService.create.mockResolvedValue({
      id: 91,
      userId: 11,
      type: 'communication-message',
    });

    await service.createMessageNotifications(
      20,
      Object.assign(
        new Message({
          id: 44,
          channelId: 20,
          senderId: 10,
        }),
        {sender: {username: 'ada'}},
      ),
      10,
    );

    expect(notificationService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'ada',
        message: 'Sent an attachment.',
      }),
    );
  });

  it('uses fallback labels for messages without sender or channel names', async () => {
    channelRepository.findById.mockResolvedValue({
      id: 20,
      workspaceId: 3,
      type: 'GROUP',
      members: [{userId: 10}, {userId: 11}],
    });
    notificationService.create.mockResolvedValue({
      id: 92,
      userId: 11,
      type: 'communication-message',
    });

    await service.createMessageNotifications(
      20,
      new Message({
        id: 44,
        channelId: 20,
        senderId: 10,
        content: 'hello',
      }),
      10,
    );

    expect(notificationService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Someone in #channel',
        message: 'hello',
        payload: expect.objectContaining({
          channelName: undefined,
        }),
      }),
    );
  });

  it('rejects users outside the workspace', async () => {
    workspaceAuthorizationService.assertPermission.mockRejectedValue(
      new HttpErrors.Forbidden('Nope'),
    );

    await expect(service.listChannels(3, 10)).rejects.toBeInstanceOf(
      HttpErrors.Forbidden,
    );
  });

  it('uses workspace authorization for owner access', async () => {
    workspaceAuthorizationService.assertPermission.mockResolvedValue(
      WORKSPACE_ROLE.OWNER,
    );
    channelMemberRepository.find.mockResolvedValue([]);

    await expect(service.listChannels(3, 10)).resolves.toEqual([]);
    expect(workspaceAuthorizationService.assertPermission).toHaveBeenCalledWith(
      3,
      10,
      WORKSPACE_PERMISSION.COMMUNICATION_VIEW,
    );
  });

  it('allows channel admins to manage group channel settings', async () => {
    workspaceAuthorizationService.getWorkspaceRole.mockResolvedValue(
      WORKSPACE_ROLE.MEMBER,
    );
    channelRepository.findById
      .mockResolvedValueOnce({id: 20, workspaceId: 3, type: 'GROUP'})
      .mockResolvedValueOnce({id: 20, type: 'GROUP', name: 'product'});
    channelMemberRepository.findOne.mockResolvedValue({
      id: 1,
      channelId: 20,
      userId: 10,
      role: 'ADMIN',
    });

    await expect(
      service.updateGroupChannel(20, 10, {name: ' product '}),
    ).resolves.toEqual({id: 20, type: 'GROUP', name: 'product'});
  });

  it('rejects regular channel members from managing group channel settings', async () => {
    workspaceAuthorizationService.getWorkspaceRole.mockResolvedValue(
      WORKSPACE_ROLE.MEMBER,
    );
    channelRepository.findById.mockResolvedValue({
      id: 20,
      workspaceId: 3,
      type: 'GROUP',
    });
    channelMemberRepository.findOne.mockResolvedValue({
      id: 1,
      channelId: 20,
      userId: 10,
      role: 'MEMBER',
    });

    await expect(
      service.updateGroupChannel(20, 10, {name: 'product'}),
    ).rejects.toBeInstanceOf(HttpErrors.Forbidden);
  });

  it('rejects stale channel admins outside the workspace from managing settings', async () => {
    workspaceAuthorizationService.getWorkspaceRole.mockResolvedValue(null);
    channelRepository.findById.mockResolvedValue({
      id: 20,
      workspaceId: 3,
      type: 'GROUP',
    });
    channelMemberRepository.findOne.mockResolvedValue({
      id: 1,
      channelId: 20,
      userId: 10,
      role: 'ADMIN',
    });

    await expect(
      service.updateGroupChannel(20, 10, {name: 'product'}),
    ).rejects.toBeInstanceOf(HttpErrors.Forbidden);
  });
});
