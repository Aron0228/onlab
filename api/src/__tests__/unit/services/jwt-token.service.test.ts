import {describe, expect, it, vi, beforeEach} from 'vitest';
import type {TokenService} from '@loopback/authentication';

import {AccessToken, User} from '../../../models';
import {JwtTokenService} from '../../../services';

describe('JwtTokenService (unit)', () => {
  let tokenService: TokenService;
  let accessTokenRepository: {
    create: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
  };
  let service: JwtTokenService;

  beforeEach(() => {
    tokenService = {
      generateToken: vi.fn().mockResolvedValue('jwt-token'),
      verifyToken: vi.fn(),
    } as unknown as TokenService;

    accessTokenRepository = {
      create: vi.fn(),
      findById: vi.fn(),
    };

    service = new JwtTokenService(
      tokenService,
      async () => accessTokenRepository as never,
    );
  });

  it('generateToken creates a persisted access token', async () => {
    accessTokenRepository.create.mockImplementation(async data => data);
    const user = new User({
      id: 7,
      githubId: 1,
      username: 'aron0228',
      fullName: 'Reszegi Aron',
      email: 'aron@example.com',
      avatarUrl: 'https://example.com/avatar.png',
    });

    const token = await service.generateToken(user, 'github-token');

    expect(tokenService.generateToken).toHaveBeenCalledWith(
      user.toUserProfile(),
    );
    expect(accessTokenRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'jwt-token',
        userId: 7,
        githubToken: 'github-token',
        revoked: false,
      }),
    );
    expect(token.id).toBe('jwt-token');
  });

  it('validateToken returns the token when it is active', async () => {
    const activeToken = new AccessToken({
      id: 'jwt-token',
      userId: 7,
      githubToken: 'github-token',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      revoked: false,
    });
    accessTokenRepository.findById.mockResolvedValue(activeToken);

    const result = await service.validateToken('jwt-token');

    expect(result).toBe(activeToken);
  });

  it('validateToken returns undefined when the token is revoked', async () => {
    accessTokenRepository.findById.mockResolvedValue(
      new AccessToken({
        id: 'jwt-token',
        userId: 7,
        githubToken: 'github-token',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        revoked: true,
      }),
    );

    await expect(service.validateToken('jwt-token')).resolves.toBeUndefined();
  });

  it('validateToken returns undefined when the token is expired', async () => {
    accessTokenRepository.findById.mockResolvedValue(
      new AccessToken({
        id: 'jwt-token',
        userId: 7,
        githubToken: 'github-token',
        createdAt: new Date(Date.now() - 120_000),
        expiresAt: new Date(Date.now() - 60_000),
        revoked: false,
      }),
    );

    await expect(service.validateToken('jwt-token')).resolves.toBeUndefined();
  });
});
