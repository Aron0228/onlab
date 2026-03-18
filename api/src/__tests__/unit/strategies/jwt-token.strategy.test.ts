import {beforeEach, describe, expect, it, vi} from 'vitest';

import {User} from '../../../models';
import {JwtTokenStrategy} from '../../../strategies/jwt-token.strategy';

describe('JwtTokenStrategy (unit)', () => {
  let jwtTokenService: {
    validateToken: ReturnType<typeof vi.fn>;
  };
  let userRepository: {
    findById: ReturnType<typeof vi.fn>;
  };
  let strategy: JwtTokenStrategy;

  beforeEach(() => {
    jwtTokenService = {
      validateToken: vi.fn(),
    };
    userRepository = {
      findById: vi.fn(),
    };

    strategy = new JwtTokenStrategy(
      jwtTokenService as never,
      userRepository as never,
    );
  });

  it('returns undefined when the authorization header is missing', async () => {
    await expect(
      strategy.authenticate({headers: {}} as never),
    ).resolves.toBeUndefined();
    expect(jwtTokenService.validateToken).not.toHaveBeenCalled();
    expect(userRepository.findById).not.toHaveBeenCalled();
  });

  it('returns undefined when the authorization header is not a bearer token', async () => {
    await expect(
      strategy.authenticate({
        headers: {authorization: 'Token jwt-token'},
      } as never),
    ).resolves.toBeUndefined();
    expect(jwtTokenService.validateToken).not.toHaveBeenCalled();
  });

  it('returns undefined when the bearer token is blank', async () => {
    await expect(
      strategy.authenticate({
        headers: {authorization: 'Bearer   '},
      } as never),
    ).resolves.toBeUndefined();
    expect(jwtTokenService.validateToken).not.toHaveBeenCalled();
  });

  it('returns undefined when the token service cannot validate the token', async () => {
    jwtTokenService.validateToken.mockResolvedValue(undefined);

    await expect(
      strategy.authenticate({
        headers: {authorization: 'Bearer jwt-token'},
      } as never),
    ).resolves.toBeUndefined();
    expect(jwtTokenService.validateToken).toHaveBeenCalledWith('jwt-token');
    expect(userRepository.findById).not.toHaveBeenCalled();
  });

  it('returns the authenticated user profile for a valid bearer token', async () => {
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
        headers: {authorization: 'Bearer jwt-token'},
      } as never),
    ).resolves.toEqual(user.toUserProfile());
    expect(jwtTokenService.validateToken).toHaveBeenCalledWith('jwt-token');
    expect(userRepository.findById).toHaveBeenCalledWith(7);
  });

  it('returns undefined when authentication throws', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    jwtTokenService.validateToken.mockRejectedValue(new Error('invalid token'));

    await expect(
      strategy.authenticate({
        headers: {authorization: 'Bearer jwt-token'},
      } as never),
    ).resolves.toBeUndefined();
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});
