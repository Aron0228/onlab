import {beforeEach, describe, expect, it, vi} from 'vitest';
import {HttpErrors} from '@loopback/rest';
import https from 'node:https';
import {EventEmitter} from 'node:events';
import type {ClientRequest, IncomingMessage, RequestOptions} from 'node:http';

import {User} from '../../../models';
import {GithubOauthService} from '../../../services';

type GithubTokenResponse = {
  access_token?: string;
  error?: string;
};

type GithubUserResponse = {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
  email: string;
};

type GithubOauthServiceInternals = {
  getAuthorizationUrl(state?: string): string;
  callback(response: unknown, code?: string): Promise<unknown>;
  verifyGithubToken(token: string): Promise<void>;
  exchangeCodeForAccessToken(code: string): Promise<GithubTokenResponse>;
  getGithubUser(accessToken: string): Promise<GithubUserResponse>;
  getOrCreateUser(githubUser: GithubUserResponse): Promise<User>;
  getGithubUserEmail(accessToken: string): Promise<string>;
  githubRequest<T>(requestData: {
    hostname: string;
    path: string;
    method: 'GET' | 'POST';
    headers: Record<string, string | number>;
    body?: string;
  }): Promise<T>;
};

const mockHttpsRequest = (
  statusCode: number,
  body: string,
): ReturnType<typeof vi.spyOn> =>
  vi.spyOn(https, 'request').mockImplementation(((
    _url: string | URL | RequestOptions,
    optionsOrCallback?: RequestOptions | ((res: IncomingMessage) => void),
    callback?: (res: IncomingMessage) => void,
  ) => {
    const listener =
      typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;
    const response = new EventEmitter() as IncomingMessage & EventEmitter;

    response.statusCode = statusCode;
    response.setEncoding = vi.fn();

    listener?.(response);
    response.emit('data', body);
    response.emit('end');

    return {
      on: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
    } as unknown as ClientRequest;
  }) as typeof https.request);

describe('GithubOauthService (unit)', () => {
  let jwtTokenService: {
    generateToken: ReturnType<typeof vi.fn>;
  };
  let userRepository: {
    findOne: ReturnType<typeof vi.fn>;
    updateById: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  let service: GithubOauthService;
  let internals: GithubOauthServiceInternals;

  beforeEach(() => {
    process.env.GITHUB_CLIENT_ID = 'client-id';
    process.env.GITHUB_CALLBACK_URL =
      'https://api.example.com/auth/github/callback';
    process.env.GITHUB_CLIENT_SECRET = 'client-secret';
    process.env.CLIENT_URL = 'https://client.example.com';

    jwtTokenService = {
      generateToken: vi.fn().mockResolvedValue({
        id: 'jwt-token',
        expiresAt: new Date('2026-03-19T10:00:00.000Z'),
      }),
    };

    userRepository = {
      findOne: vi.fn(),
      updateById: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
    };

    service = new GithubOauthService(
      jwtTokenService as never,
      async () => userRepository as never,
    );
    internals = service as unknown as GithubOauthServiceInternals;
  });

  it('getAuthorizationUrl builds the GitHub authorize URL', () => {
    const url = new URL(service.getAuthorizationUrl('state-123'));

    expect(url.origin + url.pathname).toBe(
      'https://github.com/login/oauth/authorize',
    );
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://api.example.com/auth/github/callback',
    );
    expect(url.searchParams.get('scope')).toBe('read:user user:email');
    expect(url.searchParams.get('state')).toBe('state-123');
  });

  it('callback throws when GitHub does not send a code', async () => {
    await expect(service.callback({} as never)).rejects.toThrowError(
      new HttpErrors.BadRequest(
        'GitHub did not provide the required "code" query parameter',
      ),
    );
  });

  it('callback redirects to the client callback with token data on success', async () => {
    const response = {
      redirect: vi.fn(),
    };
    const user = new User({
      id: 7,
      githubId: 1,
      username: 'aron0228',
      fullName: 'Reszegi Aron',
      email: 'aron@example.com',
      avatarUrl: 'https://example.com/avatar.png',
    });

    internals.exchangeCodeForAccessToken = vi.fn().mockResolvedValue({
      access_token: 'github-token',
    });
    internals.getGithubUser = vi.fn().mockResolvedValue({
      id: 1,
      login: 'aron0228',
      name: 'Reszegi Aron',
      avatar_url: 'https://example.com/avatar.png',
      email: 'aron@example.com',
    });
    internals.getOrCreateUser = vi.fn().mockResolvedValue(user);

    await service.callback(response as never, 'oauth-code');

    expect(response.redirect).toHaveBeenCalledWith(
      expect.stringContaining('https://client.example.com/auth/callback'),
    );
    expect(response.redirect).toHaveBeenCalledWith(
      expect.stringContaining('token_id=jwt-token'),
    );
    expect(response.redirect).toHaveBeenCalledWith(
      expect.stringContaining('user_id=7'),
    );
  });

  it('callback redirects back with the error on failure', async () => {
    const response = {
      redirect: vi.fn(),
    };

    internals.exchangeCodeForAccessToken = vi
      .fn()
      .mockRejectedValue(new Error('oauth failed'));

    await service.callback(response as never, 'oauth-code');

    expect(response.redirect).toHaveBeenCalledWith(
      expect.stringContaining('provider=github'),
    );
    expect(response.redirect).toHaveBeenCalledWith(
      expect.stringContaining('error=oauth+failed'),
    );
  });

  it('verifyGithubToken validates the token via GitHub user API', async () => {
    const githubRequestSpy = vi.fn().mockResolvedValue({
      login: 'aron0228',
      id: 1,
      avatar_url: 'https://example.com/avatar.png',
    });
    internals.githubRequest = githubRequestSpy;

    await service.verifyGithubToken('github-token');

    expect(githubRequestSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        hostname: 'api.github.com',
        path: '/user',
        method: 'GET',
      }),
    );
  });

  it('exchangeCodeForAccessToken returns the GitHub token response', async () => {
    internals.githubRequest = vi.fn().mockResolvedValue({
      access_token: 'github-token',
    });

    await expect(
      internals.exchangeCodeForAccessToken('oauth-code'),
    ).resolves.toEqual({
      access_token: 'github-token',
    });
  });

  it('exchangeCodeForAccessToken throws when the token is missing', async () => {
    internals.githubRequest = vi.fn().mockResolvedValue({
      error: 'bad_verification_code',
    });

    await expect(
      internals.exchangeCodeForAccessToken('oauth-code'),
    ).rejects.toThrow('bad_verification_code');
  });

  it('getGithubUser returns the GitHub user when email is already present', async () => {
    internals.githubRequest = vi.fn().mockResolvedValue({
      id: 1,
      login: 'aron0228',
      name: 'Reszegi Aron',
      avatar_url: 'https://example.com/avatar.png',
      email: 'aron@example.com',
    });

    const result = await internals.getGithubUser('github-token');

    expect(result).toEqual({
      id: 1,
      login: 'aron0228',
      name: 'Reszegi Aron',
      avatar_url: 'https://example.com/avatar.png',
      email: 'aron@example.com',
    });
  });

  it('getGithubUser falls back to the email lookup when email is missing', async () => {
    internals.githubRequest = vi.fn().mockResolvedValue({
      id: 1,
      login: 'aron0228',
      name: 'Reszegi Aron',
      avatar_url: 'https://example.com/avatar.png',
      email: null,
    });
    internals.getGithubUserEmail = vi
      .fn()
      .mockResolvedValue('aron@example.com');

    const result = await internals.getGithubUser('github-token');

    expect(result.email).toBe('aron@example.com');
  });

  it('getOrCreateUser updates an existing user', async () => {
    const existing = new User({
      id: 7,
      githubId: 1,
      username: 'old',
      fullName: 'Old Name',
      email: 'old@example.com',
      avatarUrl: 'old-avatar',
    });
    const updated = new User({
      ...existing,
      username: 'aron0228',
      fullName: 'Reszegi Aron',
      email: 'aron@example.com',
      avatarUrl: 'https://example.com/avatar.png',
    });

    userRepository.findOne.mockResolvedValue(existing);
    userRepository.findById.mockResolvedValue(updated);

    const result = await internals.getOrCreateUser({
      id: 1,
      login: 'aron0228',
      name: 'Reszegi Aron',
      avatar_url: 'https://example.com/avatar.png',
      email: 'aron@example.com',
    });

    expect(userRepository.updateById).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        username: 'aron0228',
        fullName: 'Reszegi Aron',
      }),
    );
    expect(result).toBe(updated);
  });

  it('getOrCreateUser creates a new user when none exists', async () => {
    const created = new User({
      id: 7,
      githubId: 1,
      username: 'aron0228',
      fullName: 'Reszegi Aron',
      email: 'aron@example.com',
      avatarUrl: 'https://example.com/avatar.png',
    });
    userRepository.findOne.mockResolvedValue(null);
    userRepository.create.mockResolvedValue(created);

    const result = await internals.getOrCreateUser({
      id: 1,
      login: 'aron0228',
      name: 'Reszegi Aron',
      avatar_url: 'https://example.com/avatar.png',
      email: 'aron@example.com',
    });

    expect(userRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'aron0228',
        fullName: 'Reszegi Aron',
      }),
    );
    expect(result).toBe(created);
  });

  it('getGithubUserEmail prefers a primary verified email', async () => {
    internals.githubRequest = vi.fn().mockResolvedValue([
      {
        email: 'secondary@example.com',
        primary: false,
        verified: true,
        visibility: 'private',
      },
      {
        email: 'primary@example.com',
        primary: true,
        verified: true,
        visibility: 'private',
      },
    ]);

    await expect(internals.getGithubUserEmail('github-token')).resolves.toBe(
      'primary@example.com',
    );
  });

  it('getGithubUserEmail throws when no usable email exists', async () => {
    internals.githubRequest = vi.fn().mockResolvedValue([
      {
        email: '',
        primary: false,
        verified: false,
        visibility: null,
      },
    ]);

    await expect(internals.getGithubUserEmail('github-token')).rejects.toThrow(
      'GitHub account does not have a usable email address',
    );
  });

  it('githubRequest resolves parsed GitHub responses', async () => {
    const requestMock = mockHttpsRequest(200, JSON.stringify({ok: true}));

    const result = await internals.githubRequest({
      hostname: 'api.github.com',
      path: '/user',
      method: 'GET',
      headers: {},
    });

    expect(requestMock).toHaveBeenCalled();
    expect(result).toEqual({ok: true});
  });

  it('githubRequest rejects non-success responses', async () => {
    mockHttpsRequest(401, 'bad token');

    await expect(
      internals.githubRequest({
        hostname: 'api.github.com',
        path: '/user',
        method: 'GET',
        headers: {},
      }),
    ).rejects.toThrow('GitHub request failed (401): bad token');
  });
});
