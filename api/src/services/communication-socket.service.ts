import {injectable, BindingScope, service} from '@loopback/core';
import {repository} from '@loopback/repository';
import type {Server as HttpServer} from 'http';
import {Server, Socket} from 'socket.io';
import {
  ChannelMemberRepository,
  ChannelRepository,
  UserRepository,
} from '../repositories';
import {JwtTokenService} from './auth';
import {CommunicationService} from './communication.service';

interface SocketUser {
  id: number;
}

interface SendSocketMessagePayload {
  channelId: number;
  content?: string;
  attachmentIds?: number[];
}

interface TypingSocketPayload {
  channelId: number;
  isTyping: boolean;
}

@injectable({scope: BindingScope.SINGLETON})
export class CommunicationSocketService {
  private io?: Server;
  private onlineConnectionCounts = new Map<number, number>();

  constructor(
    @service(JwtTokenService) private jwtTokenService: JwtTokenService,
    @service(CommunicationService)
    private communicationService: CommunicationService,
    @repository(UserRepository) private userRepository: UserRepository,
    @repository(ChannelRepository) private channelRepository: ChannelRepository,
    @repository(ChannelMemberRepository)
    private channelMemberRepository: ChannelMemberRepository,
  ) {}

  attach(httpServer: HttpServer): Server {
    if (this.io) return this.io;

    this.io = new Server(httpServer, {
      cors: {origin: process.env.CLIENT_ORIGIN ?? '*'},
      path: '/socket.io',
    });

    this.io.use(async (socket, next) => {
      try {
        const token = this.getToken(socket);
        if (!token) return next(new Error('Missing authentication token.'));

        const payload = await this.jwtTokenService.validateToken(token);
        if (!payload) return next(new Error('Invalid authentication token.'));

        const user = await this.userRepository.findById(payload.userId);
        socket.data.user = {id: user.id} satisfies SocketUser;
        socket.join(this.userRoom(user.id));

        next();
      } catch (error) {
        next(error as Error);
      }
    });

    this.io.on('connection', socket => {
      this.registerHandlers(socket);
      void this.registerPresence(socket);
    });

    return this.io;
  }

  emitMessage(channelId: number, message: unknown): void {
    this.io?.to(this.channelRoom(channelId)).emit('message:created', message);
  }

  private registerHandlers(socket: Socket): void {
    socket.on('channel:join', async (channelId: number, callback) => {
      try {
        await this.communicationService.assertChannelMember(
          channelId,
          this.currentUser(socket).id,
        );
        socket.join(this.channelRoom(channelId));
        callback?.({ok: true});
      } catch (error) {
        callback?.({ok: false, error: (error as Error).message});
      }
    });

    socket.on(
      'message:send',
      async (payload: SendSocketMessagePayload, callback) => {
        try {
          const user = this.currentUser(socket);
          const message = await this.communicationService.sendMessage({
            channelId: payload.channelId,
            senderId: user.id,
            content: payload.content,
            attachmentIds: payload.attachmentIds,
          });

          const channel = await this.channelRepository.findById(
            payload.channelId,
            {include: [{relation: 'members'}]},
          );

          this.emitMessage(payload.channelId, message);
          for (const member of channel.members ?? []) {
            this.io?.to(this.userRoom(member.userId)).emit('channel:updated', {
              channelId: payload.channelId,
              message,
            });
          }

          callback?.({ok: true, message});
        } catch (error) {
          callback?.({ok: false, error: (error as Error).message});
        }
      },
    );

    socket.on('typing:update', async (payload: TypingSocketPayload) => {
      try {
        const user = this.currentUser(socket);
        await this.communicationService.assertChannelMember(
          payload.channelId,
          user.id,
        );

        socket.to(this.channelRoom(payload.channelId)).emit('typing:updated', {
          channelId: payload.channelId,
          userId: user.id,
          isTyping: payload.isTyping,
        });
      } catch {
        // Typing indicators are ephemeral; invalid attempts are ignored.
      }
    });

    socket.on('presence:request', callback => {
      const payload = {
        onlineUserIds: [...this.onlineConnectionCounts.keys()],
      };

      socket.emit('presence:snapshot', payload);
      if (typeof callback === 'function') {
        callback(payload);
      }
    });
  }

  private async registerPresence(socket: Socket): Promise<void> {
    const user = this.currentUser(socket);
    const currentCount = this.onlineConnectionCounts.get(user.id) ?? 0;
    this.onlineConnectionCounts.set(user.id, currentCount + 1);

    socket.emit('presence:snapshot', {
      onlineUserIds: [...this.onlineConnectionCounts.keys()],
    });

    if (currentCount === 0) {
      await this.emitPresenceUpdate(user.id, true);
    }

    socket.on('disconnect', () => {
      void this.unregisterPresence(user.id);
    });
  }

  private async unregisterPresence(userId: number): Promise<void> {
    const nextCount = (this.onlineConnectionCounts.get(userId) ?? 1) - 1;

    if (nextCount > 0) {
      this.onlineConnectionCounts.set(userId, nextCount);
      return;
    }

    this.onlineConnectionCounts.delete(userId);
    await this.emitPresenceUpdate(userId, false);
  }

  private async emitPresenceUpdate(
    userId: number,
    isOnline: boolean,
  ): Promise<void> {
    const memberships = await this.channelMemberRepository.find({
      where: {userId},
    });
    const channelIds = memberships.map(membership => membership.channelId);
    const relatedMemberships = channelIds.length
      ? await this.channelMemberRepository.find({
          where: {channelId: {inq: channelIds}},
        })
      : [];
    const relatedUserIds = new Set(
      relatedMemberships.map(membership => membership.userId),
    );
    const payload = {
      userId,
      isOnline,
      lastSeenAt: isOnline ? undefined : new Date().toISOString(),
    };

    for (const relatedUserId of relatedUserIds) {
      this.io
        ?.to(this.userRoom(relatedUserId))
        .emit('presence:updated', payload);
    }
  }

  private currentUser(socket: Socket): SocketUser {
    return socket.data.user as SocketUser;
  }

  private getToken(socket: Socket): string | undefined {
    const authToken = socket.handshake.auth.token;
    if (typeof authToken === 'string') return authToken;

    const queryToken = socket.handshake.query.token;
    return typeof queryToken === 'string' ? queryToken : undefined;
  }

  private channelRoom(channelId: number): string {
    return `communication:channel:${channelId}`;
  }

  private userRoom(userId: number): string {
    return `communication:user:${userId}`;
  }
}
