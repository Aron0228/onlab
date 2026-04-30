import {beforeEach, describe, expect, it, vi} from 'vitest';

const socketIoMock = vi.hoisted(() => ({
  Server: vi.fn(),
}));

vi.mock('socket.io', () => ({
  Server: socketIoMock.Server,
}));

import {CommunicationSocketService} from '../../../services/communication-socket.service';

type SocketHandler = (...args: never[]) => unknown;

function createSocket(userId = 10) {
  const handlers = new Map<string, SocketHandler>();
  const emit = vi.fn();
  const join = vi.fn();
  const roomEmit = vi.fn();
  const to = vi.fn(() => ({emit: roomEmit}));
  const socket = {
    data: {user: {id: userId}},
    handshake: {auth: {}, query: {}},
    emit,
    join,
    on: vi.fn((event: string, handler: SocketHandler) => {
      handlers.set(event, handler);
    }),
    to,
  };

  return {socket, handlers, emit, join, to, roomEmit};
}

function createSocketIoServer() {
  let middleware: SocketHandler | undefined;
  let connectionHandler: SocketHandler | undefined;
  const roomEmit = vi.fn();
  const server = {
    use: vi.fn((handler: SocketHandler) => {
      middleware = handler;
    }),
    on: vi.fn((event: string, handler: SocketHandler) => {
      if (event === 'connection') connectionHandler = handler;
    }),
    to: vi.fn(() => ({emit: roomEmit})),
  };

  return {
    server,
    roomEmit,
    get middleware() {
      return middleware;
    },
    get connectionHandler() {
      return connectionHandler;
    },
  };
}

describe('CommunicationSocketService (unit)', () => {
  let jwtTokenService: {validateToken: ReturnType<typeof vi.fn>};
  let communicationService: {
    assertChannelMember: ReturnType<typeof vi.fn>;
    sendMessage: ReturnType<typeof vi.fn>;
  };
  let userRepository: {findById: ReturnType<typeof vi.fn>};
  let channelRepository: {findById: ReturnType<typeof vi.fn>};
  let channelMemberRepository: {find: ReturnType<typeof vi.fn>};
  let service: CommunicationSocketService;

  beforeEach(() => {
    socketIoMock.Server.mockReset();
    jwtTokenService = {validateToken: vi.fn()};
    communicationService = {
      assertChannelMember: vi.fn(),
      sendMessage: vi.fn(),
    };
    userRepository = {findById: vi.fn()};
    channelRepository = {findById: vi.fn()};
    channelMemberRepository = {find: vi.fn()};

    service = new CommunicationSocketService(
      jwtTokenService as never,
      communicationService as never,
      userRepository as never,
      channelRepository as never,
      channelMemberRepository as never,
    );
  });

  it('attaches socket.io once and authenticates sockets', async () => {
    const socketIoServer = createSocketIoServer();
    socketIoMock.Server.mockImplementation(function () {
      return socketIoServer.server;
    });
    const {socket, join} = createSocket();
    socket.handshake.auth = {token: 'token-1'};
    jwtTokenService.validateToken.mockResolvedValue({userId: 10});
    userRepository.findById.mockResolvedValue({id: 10});

    const firstServer = service.attach({} as never);
    const secondServer = service.attach({} as never);

    expect(firstServer).toBe(socketIoServer.server);
    expect(secondServer).toBe(firstServer);
    expect(socketIoMock.Server).toHaveBeenCalledWith(
      {},
      {cors: {origin: '*'}, path: '/socket.io'},
    );

    const next = vi.fn();
    await socketIoServer.middleware?.(socket as never, next as never);

    expect(jwtTokenService.validateToken).toHaveBeenCalledWith('token-1');
    expect(join).toHaveBeenCalledWith('communication:user:10');
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects socket authentication without a usable token or payload', async () => {
    const socketIoServer = createSocketIoServer();
    socketIoMock.Server.mockImplementation(function () {
      return socketIoServer.server;
    });
    service.attach({} as never);

    const missingTokenSocket = createSocket().socket;
    const missingTokenNext = vi.fn();
    await socketIoServer.middleware?.(
      missingTokenSocket as never,
      missingTokenNext as never,
    );
    expect(missingTokenNext.mock.calls[0][0]).toEqual(
      new Error('Missing authentication token.'),
    );

    const invalidTokenSocket = createSocket().socket;
    invalidTokenSocket.handshake.query = {token: 'query-token'};
    jwtTokenService.validateToken.mockResolvedValue(null);
    const invalidTokenNext = vi.fn();
    await socketIoServer.middleware?.(
      invalidTokenSocket as never,
      invalidTokenNext as never,
    );
    expect(invalidTokenNext.mock.calls[0][0]).toEqual(
      new Error('Invalid authentication token.'),
    );
  });

  it('registers channel join handlers with success and failure callbacks', async () => {
    const {socket, handlers, join} = createSocket();
    const callback = vi.fn();
    service['registerHandlers'](socket as never);

    await handlers.get('channel:join')?.(20 as never, callback as never);

    expect(communicationService.assertChannelMember).toHaveBeenCalledWith(
      20,
      10,
    );
    expect(join).toHaveBeenCalledWith('communication:channel:20');
    expect(callback).toHaveBeenCalledWith({ok: true});

    communicationService.assertChannelMember.mockRejectedValue(
      new Error('Forbidden'),
    );
    const failedCallback = vi.fn();

    await handlers.get('channel:join')?.(21 as never, failedCallback as never);

    expect(failedCallback).toHaveBeenCalledWith({
      ok: false,
      error: 'Forbidden',
    });
  });

  it('sends messages and broadcasts channel updates to members', async () => {
    const {socket, handlers} = createSocket();
    const socketIoServer = createSocketIoServer();
    service['io'] = socketIoServer.server as never;
    const message = {id: 44, content: 'hello'};
    communicationService.sendMessage.mockResolvedValue(message);
    channelRepository.findById.mockResolvedValue({
      id: 20,
      members: [{userId: 10}, {userId: 11}],
    });

    service['registerHandlers'](socket as never);
    const callback = vi.fn();
    await handlers.get('message:send')?.(
      {
        channelId: 20,
        content: 'hello',
        attachmentIds: [90],
      } as never,
      callback as never,
    );

    expect(communicationService.sendMessage).toHaveBeenCalledWith({
      channelId: 20,
      senderId: 10,
      content: 'hello',
      attachmentIds: [90],
    });
    expect(channelRepository.findById).toHaveBeenCalledWith(20, {
      include: [{relation: 'members'}],
    });
    expect(socketIoServer.server.to).toHaveBeenCalledWith(
      'communication:channel:20',
    );
    expect(socketIoServer.roomEmit).toHaveBeenCalledWith(
      'message:created',
      message,
    );
    expect(socketIoServer.server.to).toHaveBeenCalledWith(
      'communication:user:10',
    );
    expect(socketIoServer.server.to).toHaveBeenCalledWith(
      'communication:user:11',
    );
    expect(socketIoServer.roomEmit).toHaveBeenCalledWith('channel:updated', {
      channelId: 20,
      message,
    });
    expect(callback).toHaveBeenCalledWith({ok: true, message});
  });

  it('returns socket message send errors through the callback', async () => {
    const {socket, handlers} = createSocket();
    communicationService.sendMessage.mockRejectedValue(new Error('Nope'));
    service['registerHandlers'](socket as never);

    const callback = vi.fn();
    await handlers.get('message:send')?.(
      {channelId: 20, content: 'hello'} as never,
      callback as never,
    );

    expect(callback).toHaveBeenCalledWith({ok: false, error: 'Nope'});
  });

  it('emits typing updates only after membership validation', async () => {
    const {socket, handlers, to, roomEmit} = createSocket();
    service['registerHandlers'](socket as never);

    await handlers.get('typing:update')?.({
      channelId: 20,
      isTyping: true,
    } as never);

    expect(communicationService.assertChannelMember).toHaveBeenCalledWith(
      20,
      10,
    );
    expect(to).toHaveBeenCalledWith('communication:channel:20');
    expect(roomEmit).toHaveBeenCalledWith('typing:updated', {
      channelId: 20,
      userId: 10,
      isTyping: true,
    });

    communicationService.assertChannelMember.mockRejectedValue(
      new Error('Forbidden'),
    );
    await expect(
      handlers.get('typing:update')?.({channelId: 21, isTyping: true} as never),
    ).resolves.toBeUndefined();
  });

  it('returns presence snapshots and ignores non-function acknowledgements', () => {
    const {socket, handlers, emit} = createSocket();
    service['onlineConnectionCounts'].set(10, 1);
    service['onlineConnectionCounts'].set(11, 2);
    service['registerHandlers'](socket as never);

    const callback = vi.fn();
    handlers.get('presence:request')?.(callback as never);
    handlers.get('presence:request')?.('not-a-callback' as never);

    const payload = {onlineUserIds: [10, 11]};
    expect(emit).toHaveBeenCalledWith('presence:snapshot', payload);
    expect(callback).toHaveBeenCalledWith(payload);
  });

  it('tracks presence counts and notifies related users on first connect and final disconnect', async () => {
    const {socket, emit} = createSocket();
    const socketIoServer = createSocketIoServer();
    service['io'] = socketIoServer.server as never;
    channelMemberRepository.find
      .mockResolvedValueOnce([{channelId: 20}, {channelId: 21}])
      .mockResolvedValueOnce([{userId: 10}, {userId: 11}, {userId: 12}])
      .mockResolvedValueOnce([{channelId: 20}])
      .mockResolvedValueOnce([{userId: 10}, {userId: 11}]);

    await service['registerPresence'](socket as never);
    await service['registerPresence'](socket as never);

    expect(emit).toHaveBeenCalledWith('presence:snapshot', {
      onlineUserIds: [10],
    });
    expect(socketIoServer.roomEmit).toHaveBeenCalledWith('presence:updated', {
      userId: 10,
      isOnline: true,
      lastSeenAt: undefined,
    });

    await service['unregisterPresence'](10);
    expect(service['onlineConnectionCounts'].get(10)).toBe(1);

    await service['unregisterPresence'](10);

    expect(service['onlineConnectionCounts'].has(10)).toBe(false);
    expect(socketIoServer.roomEmit).toHaveBeenCalledWith('presence:updated', {
      userId: 10,
      isOnline: false,
      lastSeenAt: expect.any(String),
    });
  });

  it('skips related-user lookups when a user has no memberships', async () => {
    const socketIoServer = createSocketIoServer();
    service['io'] = socketIoServer.server as never;
    channelMemberRepository.find.mockResolvedValueOnce([]);

    await service['emitPresenceUpdate'](99, true);

    expect(channelMemberRepository.find).toHaveBeenCalledTimes(1);
    expect(socketIoServer.server.to).not.toHaveBeenCalled();
  });
});
