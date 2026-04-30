import {describe, expect, it, vi} from 'vitest';
import {securityId} from '@loopback/security';
import {CommunicationController} from '../../../controllers/communication';

describe('CommunicationController (unit)', () => {
  const user = {id: 10, [securityId]: '10'};

  function createSubject() {
    const communicationService = {
      listChannels: vi.fn(),
      createGroupChannel: vi.fn(),
      findOrCreateDirectChannel: vi.fn(),
      addMember: vi.fn(),
      updateGroupChannel: vi.fn(),
      leaveGroupChannel: vi.fn(),
      deleteGroupChannel: vi.fn(),
      updateChannelMute: vi.fn(),
      listMessages: vi.fn(),
      sendMessage: vi.fn(),
    };

    return {
      communicationService,
      controller: new CommunicationController(communicationService as never),
    };
  }

  it('lists workspace channels for the authenticated user', async () => {
    const {controller, communicationService} = createSubject();
    communicationService.listChannels.mockResolvedValue([{id: 1}]);

    await expect(controller.listChannels(3, user)).resolves.toEqual([{id: 1}]);
    expect(communicationService.listChannels).toHaveBeenCalledWith(3, 10);
  });

  it('creates group channels', async () => {
    const {controller, communicationService} = createSubject();
    communicationService.createGroupChannel.mockResolvedValue({id: 2});

    await expect(
      controller.createGroupChannel(3, user, {
        name: 'general',
        memberIds: [11],
      }),
    ).resolves.toEqual({id: 2});
    expect(communicationService.createGroupChannel).toHaveBeenCalledWith(
      {workspaceId: 3, name: 'general', memberIds: [11]},
      10,
    );
  });

  it('finds or creates direct channels', async () => {
    const {controller, communicationService} = createSubject();
    communicationService.findOrCreateDirectChannel.mockResolvedValue({id: 3});

    await expect(
      controller.findOrCreateDirectChannel(3, user, {participantId: 11}),
    ).resolves.toEqual({id: 3});
    expect(communicationService.findOrCreateDirectChannel).toHaveBeenCalledWith(
      3,
      10,
      11,
    );
  });

  it('adds channel members', async () => {
    const {controller, communicationService} = createSubject();
    communicationService.addMember.mockResolvedValue({id: 4});

    await expect(controller.addMember(20, user, {userId: 11})).resolves.toEqual(
      {id: 4},
    );
    expect(communicationService.addMember).toHaveBeenCalledWith(20, 11, 10);
  });

  it('renames group channels', async () => {
    const {controller, communicationService} = createSubject();
    communicationService.updateGroupChannel.mockResolvedValue({id: 20});

    await expect(
      controller.updateGroupChannel(20, user, {name: 'product'}),
    ).resolves.toEqual({id: 20});
    expect(communicationService.updateGroupChannel).toHaveBeenCalledWith(
      20,
      10,
      {name: 'product'},
    );
  });

  it('leaves group channels', async () => {
    const {controller, communicationService} = createSubject();
    communicationService.leaveGroupChannel.mockResolvedValue(undefined);

    await expect(
      controller.leaveGroupChannel(20, user),
    ).resolves.toBeUndefined();
    expect(communicationService.leaveGroupChannel).toHaveBeenCalledWith(20, 10);
  });

  it('deletes group channels', async () => {
    const {controller, communicationService} = createSubject();
    communicationService.deleteGroupChannel.mockResolvedValue(undefined);

    await expect(
      controller.deleteGroupChannel(20, user),
    ).resolves.toBeUndefined();
    expect(communicationService.deleteGroupChannel).toHaveBeenCalledWith(
      20,
      10,
    );
  });

  it('updates channel mute preference', async () => {
    const {controller, communicationService} = createSubject();
    communicationService.updateChannelMute.mockResolvedValue({id: 7});

    await expect(
      controller.updateChannelMute(20, user, {muted: true}),
    ).resolves.toEqual({id: 7});
    expect(communicationService.updateChannelMute).toHaveBeenCalledWith(
      20,
      10,
      {muted: true},
    );
  });

  it('lists channel messages', async () => {
    const {controller, communicationService} = createSubject();
    communicationService.listMessages.mockResolvedValue([{id: 5}]);
    const filter = {limit: 10};

    await expect(controller.listMessages(20, user, filter)).resolves.toEqual([
      {id: 5},
    ]);
    expect(communicationService.listMessages).toHaveBeenCalledWith(
      20,
      10,
      filter,
    );
  });

  it('sends channel messages', async () => {
    const {controller, communicationService} = createSubject();
    communicationService.sendMessage.mockResolvedValue({id: 6});

    await expect(
      controller.sendMessage(20, user, {
        content: 'hello',
        attachmentIds: [90],
      }),
    ).resolves.toEqual({id: 6});
    expect(communicationService.sendMessage).toHaveBeenCalledWith({
      channelId: 20,
      senderId: 10,
      content: 'hello',
      attachmentIds: [90],
    });
  });
});
