import {HttpErrors} from '@loopback/rest';
import {describe, expect, it, vi} from 'vitest';

import {GithubController} from '../../../controllers/github-integration/github.controller';
import {WORKSPACE_PERMISSION} from '../../../constants';

describe('GithubController (unit)', () => {
  it('requires workspace install permission before redirecting to GitHub', async () => {
    const githubService = {
      getInstallationUrl: vi
        .fn()
        .mockResolvedValue(
          'https://github.com/apps/devteams/installations/new',
        ),
      callback: vi.fn(),
    };
    const authorization = {
      getAuthenticatedUserId: vi.fn().mockReturnValue(7),
      assertPermission: vi.fn().mockResolvedValue('ADMIN'),
    };
    const response = {
      redirect: vi.fn(),
    };
    const controller = new GithubController(
      githubService as never,
      authorization as never,
    );

    await expect(
      controller.installGithubApp({id: 7} as never, response as never, '42'),
    ).resolves.toBeUndefined();

    expect(authorization.assertPermission).toHaveBeenCalledWith(
      42,
      7,
      WORKSPACE_PERMISSION.GITHUB_INSTALL_MANAGE,
    );
    expect(githubService.getInstallationUrl).toHaveBeenCalledWith({
      workspaceId: 42,
      userId: 7,
    });
    expect(response.redirect).toHaveBeenCalledWith(
      'https://github.com/apps/devteams/installations/new',
    );
  });

  it('rejects install requests without a workspace id', async () => {
    const controller = new GithubController({} as never, {} as never);

    await expect(
      controller.installGithubApp({id: 7} as never, {} as never),
    ).rejects.toBeInstanceOf(HttpErrors.BadRequest);
  });

  it('delegates callback handling to the GitHub service', async () => {
    const githubService = {
      callback: vi.fn().mockResolvedValue({redirected: true}),
    };
    const controller = new GithubController(
      githubService as never,
      {} as never,
    );
    const response = {redirect: vi.fn()};

    await expect(
      controller.githubCallback(
        response as never,
        '77',
        'install',
        'signed-state',
      ),
    ).resolves.toEqual({redirected: true});

    expect(githubService.callback).toHaveBeenCalledWith(
      response,
      '77',
      'install',
      'signed-state',
    );
  });
});
