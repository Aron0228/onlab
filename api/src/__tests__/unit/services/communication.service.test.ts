import {HttpErrors} from '@loopback/rest';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {CommunicationService} from '../../../services';

describe('CommunicationService (unit)', () => {
  let channelRepository: Record<string, ReturnType<typeof vi.fn>>;
  let channelMemberRepository: Record<string, ReturnType<typeof vi.fn>>;
  let messageRepository: Record<string, ReturnType<typeof vi.fn>>;
  let messageAttachmentRepository: Record<string, ReturnType<typeof vi.fn>>;
  let workspaceMemberRepository: Record<string, ReturnType<typeof vi.fn>>;
  let workspaceRepository: Record<string, ReturnType<typeof vi.fn>>;
  let fileRepository: Record<string, ReturnType<typeof vi.fn>>;
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
    workspaceMemberRepository = {
      findOne: vi.fn().mockResolvedValue({id: 1}),
    };
    workspaceRepository = {
      findById: vi.fn().mockResolvedValue({id: 3, ownerId: 99}),
    };
    fileRepository = {
      findById: vi.fn(),
    };

    service = new CommunicationService(
      channelRepository as never,
      channelMemberRepository as never,
      messageRepository as never,
      messageAttachmentRepository as never,
      workspaceMemberRepository as never,
      workspaceRepository as never,
      fileRepository as never,
    );
  });

  it('lists only channels where the user is a member', async () => {
    channelMemberRepository.find.mockResolvedValue([
      {channelId: 4},
      {channelId: 7},
    ]);
    channelRepository.find.mockResolvedValue([{id: 7}]);

    await expect(service.listChannels(3, 10)).resolves.toEqual([{id: 7}]);

    expect(workspaceMemberRepository.findOne).toHaveBeenCalledWith({
      where: {workspaceId: 3, userId: 10},
    });
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
    expect(channelMemberRepository.create).toHaveBeenCalledTimes(3);
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
    channelRepository.findById.mockResolvedValue({
      id: 20,
      workspaceId: 3,
      type: 'GROUP',
    });
    channelMemberRepository.findOne
      .mockResolvedValueOnce({id: 1, channelId: 20, userId: 10})
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
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
  });

  it('renames group channels and returns the updated channel', async () => {
    channelRepository.findById
      .mockResolvedValueOnce({id: 20, workspaceId: 3, type: 'GROUP'})
      .mockResolvedValueOnce({id: 20, type: 'GROUP', name: 'product'});
    channelMemberRepository.findOne.mockResolvedValue({
      id: 1,
      channelId: 20,
      userId: 10,
    });

    await expect(
      service.updateGroupChannel(20, 10, {name: ' product '}),
    ).resolves.toEqual({id: 20, type: 'GROUP', name: 'product'});

    expect(channelRepository.updateById).toHaveBeenCalledWith(20, {
      name: 'product',
      updatedAt: expect.any(String),
    });
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
  });

  it('deletes group channels when requested by a member', async () => {
    channelRepository.findById.mockResolvedValue({
      id: 20,
      workspaceId: 3,
      type: 'GROUP',
    });
    channelMemberRepository.findOne.mockResolvedValue({
      id: 1,
      channelId: 20,
      userId: 10,
    });

    await expect(service.deleteGroupChannel(20, 10)).resolves.toBeUndefined();

    expect(channelRepository.deleteById).toHaveBeenCalledWith(20);
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

  it('rejects users outside the workspace', async () => {
    workspaceMemberRepository.findOne.mockResolvedValue(null);

    await expect(service.listChannels(3, 10)).rejects.toBeInstanceOf(
      HttpErrors.Forbidden,
    );
  });

  it('treats the workspace owner as a workspace member', async () => {
    workspaceRepository.findById.mockResolvedValue({id: 3, ownerId: 10});
    channelMemberRepository.find.mockResolvedValue([]);

    await expect(service.listChannels(3, 10)).resolves.toEqual([]);
    expect(workspaceMemberRepository.findOne).not.toHaveBeenCalled();
  });
});
