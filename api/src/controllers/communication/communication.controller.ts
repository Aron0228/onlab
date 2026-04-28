import {authenticate} from '@loopback/authentication';
import {inject, intercept, service} from '@loopback/core';
import {Filter} from '@loopback/repository';
import {del, get, param, patch, post, requestBody} from '@loopback/rest';
import {SecurityBindings, UserProfile} from '@loopback/security';
import {Channel, Message} from '../../models';
import {CommunicationService} from '../../services';

interface CreateGroupChannelRequest {
  name: string;
  memberIds?: number[];
}

interface CreateDirectChannelRequest {
  participantId: number;
}

interface AddMemberRequest {
  userId: number;
}

interface UpdateGroupChannelRequest {
  name: string;
}

interface UpdateChannelMuteRequest {
  muted: boolean;
}

interface SendMessageRequest {
  content?: string;
  attachmentIds?: number[];
}

@authenticate('jwt-header')
export class CommunicationController {
  constructor(
    @service(CommunicationService)
    private communicationService: CommunicationService,
  ) {}

  @get('/communication/workspaces/{workspaceId}/channels')
  @intercept('interceptors.json-api-serializer')
  async listChannels(
    @param.path.number('workspaceId') workspaceId: number,
    @inject(SecurityBindings.USER) user: UserProfile,
  ): Promise<Channel[]> {
    return this.communicationService.listChannels(workspaceId, Number(user.id));
  }

  @post('/communication/workspaces/{workspaceId}/channels')
  @intercept('interceptors.json-api-serializer')
  async createGroupChannel(
    @param.path.number('workspaceId') workspaceId: number,
    @inject(SecurityBindings.USER) user: UserProfile,
    @requestBody() body: CreateGroupChannelRequest,
  ): Promise<Channel> {
    return this.communicationService.createGroupChannel(
      {workspaceId, name: body.name, memberIds: body.memberIds},
      Number(user.id),
    );
  }

  @post('/communication/workspaces/{workspaceId}/direct-channels')
  @intercept('interceptors.json-api-serializer')
  async findOrCreateDirectChannel(
    @param.path.number('workspaceId') workspaceId: number,
    @inject(SecurityBindings.USER) user: UserProfile,
    @requestBody() body: CreateDirectChannelRequest,
  ): Promise<Channel> {
    return this.communicationService.findOrCreateDirectChannel(
      workspaceId,
      Number(user.id),
      body.participantId,
    );
  }

  @post('/communication/channels/{channelId}/members')
  @intercept('interceptors.json-api-serializer')
  async addMember(
    @param.path.number('channelId') channelId: number,
    @inject(SecurityBindings.USER) user: UserProfile,
    @requestBody() body: AddMemberRequest,
  ) {
    return this.communicationService.addMember(
      channelId,
      body.userId,
      Number(user.id),
    );
  }

  @patch('/communication/channels/{channelId}')
  @intercept('interceptors.json-api-serializer')
  async updateGroupChannel(
    @param.path.number('channelId') channelId: number,
    @inject(SecurityBindings.USER) user: UserProfile,
    @requestBody() body: UpdateGroupChannelRequest,
  ): Promise<Channel> {
    return this.communicationService.updateGroupChannel(
      channelId,
      Number(user.id),
      {name: body.name},
    );
  }

  @post('/communication/channels/{channelId}/leave')
  async leaveGroupChannel(
    @param.path.number('channelId') channelId: number,
    @inject(SecurityBindings.USER) user: UserProfile,
  ): Promise<void> {
    return this.communicationService.leaveGroupChannel(
      channelId,
      Number(user.id),
    );
  }

  @del('/communication/channels/{channelId}')
  async deleteGroupChannel(
    @param.path.number('channelId') channelId: number,
    @inject(SecurityBindings.USER) user: UserProfile,
  ): Promise<void> {
    return this.communicationService.deleteGroupChannel(
      channelId,
      Number(user.id),
    );
  }

  @patch('/communication/channels/{channelId}/mute')
  @intercept('interceptors.json-api-serializer')
  async updateChannelMute(
    @param.path.number('channelId') channelId: number,
    @inject(SecurityBindings.USER) user: UserProfile,
    @requestBody() body: UpdateChannelMuteRequest,
  ) {
    return this.communicationService.updateChannelMute(
      channelId,
      Number(user.id),
      {muted: body.muted},
    );
  }

  @get('/communication/channels/{channelId}/messages')
  @intercept('interceptors.json-api-serializer')
  async listMessages(
    @param.path.number('channelId') channelId: number,
    @inject(SecurityBindings.USER) user: UserProfile,
    @param.query.object('filter') filter?: Filter<Message>,
  ): Promise<Message[]> {
    return this.communicationService.listMessages(
      channelId,
      Number(user.id),
      filter,
    );
  }

  @post('/communication/channels/{channelId}/messages')
  @intercept('interceptors.json-api-serializer')
  async sendMessage(
    @param.path.number('channelId') channelId: number,
    @inject(SecurityBindings.USER) user: UserProfile,
    @requestBody() body: SendMessageRequest,
  ): Promise<Message> {
    return this.communicationService.sendMessage({
      channelId,
      senderId: Number(user.id),
      content: body.content,
      attachmentIds: body.attachmentIds,
    });
  }
}
