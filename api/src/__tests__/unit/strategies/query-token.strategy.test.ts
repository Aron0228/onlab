import {beforeEach, describe, expect, it, vi} from 'vitest';

import {User} from '../../../models';
import {QueryTokenStrategy} from '../../../strategies/query-token.strategy';

describe('QueryTokenStrategy (unit)', () => {
  let jwtTokenService: {
    validateToken: ReturnType<typeof vi.fn>;
  };
  let userRepository: {
    findById: ReturnType<typeof vi.fn>;
  };
  let strategy: QueryTokenStrategy;

  beforeEach(() => {
    jwtTokenService = {
      validateToken: vi.fn(),
    };
    userRepository = {
      findById: vi.fn(),
    };

    strategy = new QueryTokenStrategy(
      jwtTokenService as never,
      userRepository as never,
    );
  });

  it('returns undefined when there is no token in route params or query params', async () => {
    await expect(
      strategy.authenticate({
        params: {},
        query: {},
      } as never),
    ).resolves.toBeUndefined();
    expect(jwtTokenService.validateToken).not.toHaveBeenCalled();
  });

  it('authenticates with the token route param', async () => {
    const user = new User({
      id: 7,
      githubId: 1,
      username: 'aron0228',
      fullName: 'Reszegi Aron',
      email: 'aron@example.com',
      avatarUrl: 'https://example.com/avatar.png',
    });
    jwtTokenService.validateToken.mockResolvedValue({userId: 7});
    userRepository.findById.mockResolvedValue(user);

    await expect(
      strategy.authenticate({
        params: {token: 'jwt-token'},
        query: {},
      } as never),
    ).resolves.toEqual(user.toUserProfile());
    expect(jwtTokenService.validateToken).toHaveBeenCalledWith('jwt-token');
  });

  it('authenticates with the token_id route param', async () => {
    const user = new User({
      id: 7,
      githubId: 1,
      username: 'aron0228',
      fullName: 'Reszegi Aron',
      email: 'aron@example.com',
      avatarUrl: 'https://example.com/avatar.png',
    });
    jwtTokenService.validateToken.mockResolvedValue({userId: 7});
    userRepository.findById.mockResolvedValue(user);

    await expect(
      strategy.authenticate({
        params: {token_id: 'jwt-token-id'},
        query: {},
      } as never),
    ).resolves.toEqual(user.toUserProfile());
    expect(jwtTokenService.validateToken).toHaveBeenCalledWith('jwt-token-id');
  });

  it('authenticates with the first query token value', async () => {
    const user = new User({
      id: 9,
      githubId: 2,
      username: 'query-user',
      fullName: 'Query User',
      email: 'query@example.com',
      avatarUrl: 'https://example.com/query.png',
    });
    jwtTokenService.validateToken.mockResolvedValue({userId: 9});
    userRepository.findById.mockResolvedValue(user);

    await expect(
      strategy.authenticate({
        params: {},
        query: {token: ['query-token', 'ignored-token']},
      } as never),
    ).resolves.toEqual(user.toUserProfile());
    expect(jwtTokenService.validateToken).toHaveBeenCalledWith('query-token');
  });

  it('returns undefined when the resolved token is blank', async () => {
    await expect(
      strategy.authenticate({
        params: {token_id: '   '},
        query: {},
      } as never),
    ).resolves.toBeUndefined();
    expect(jwtTokenService.validateToken).not.toHaveBeenCalled();
  });

  it('returns undefined when validation throws', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    jwtTokenService.validateToken.mockRejectedValue(new Error('boom'));

    await expect(
      strategy.authenticate({
        params: {},
        query: {token_id: 'jwt-token'},
      } as never),
    ).resolves.toBeUndefined();
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});
