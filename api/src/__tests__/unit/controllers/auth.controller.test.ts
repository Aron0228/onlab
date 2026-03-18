import {beforeEach, describe, expect, it, vi} from 'vitest';

import {AuthController} from '../../../controllers/auth.controller';

describe('AuthController (unit)', () => {
  let githubOauthService: {
    getAuthorizationUrl: ReturnType<typeof vi.fn>;
    callback: ReturnType<typeof vi.fn>;
  };
  let controller: AuthController;

  beforeEach(() => {
    githubOauthService = {
      getAuthorizationUrl: vi.fn(),
      callback: vi.fn(),
    };
    controller = new AuthController(githubOauthService as never);
  });

  it('redirects to the GitHub authorization URL', async () => {
    const response = {
      redirect: vi.fn(),
    };
    githubOauthService.getAuthorizationUrl.mockReturnValue(
      'https://github.com/login/oauth/authorize?state=route-back',
    );

    await controller.github(response as never, 'route-back');

    expect(githubOauthService.getAuthorizationUrl).toHaveBeenCalledWith(
      'route-back',
    );
    expect(response.redirect).toHaveBeenCalledWith(
      'https://github.com/login/oauth/authorize?state=route-back',
    );
  });

  it('delegates the GitHub callback handling to the oauth service', async () => {
    const response = {redirect: vi.fn()};
    const callbackResult = {redirected: true};
    githubOauthService.callback.mockResolvedValue(callbackResult);

    await expect(
      controller.githubCallback(response as never, 'oauth-code'),
    ).resolves.toEqual(callbackResult);
    expect(githubOauthService.callback).toHaveBeenCalledWith(
      response,
      'oauth-code',
    );
  });
});
