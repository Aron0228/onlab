import {HttpErrors} from '@loopback/rest';
import {describe, expect, it, vi} from 'vitest';
import {GithubController} from '../../controllers/github-integration/github.controller';
import {WORKSPACE_PERMISSION} from '../../constants';
import {createAuthorizationMock, securityUsers, workspaceId} from './helpers';

describe('security: GitHub App installation boundary', () => {
  function createSubject() {
    const githubService = {
      getInstallationUrl: vi
        .fn()
        .mockResolvedValue(
          'https://github.com/apps/devteams/installations/new',
        ),
      callback: vi.fn(),
    };
    const authorization = createAuthorizationMock();
    const response = {redirect: vi.fn()};
    const controller = new GithubController(
      githubService as never,
      authorization as never,
    );

    return {authorization, controller, githubService, response};
  }

  it('allows workspace owners to start installation', async () => {
    const {authorization, controller, githubService, response} =
      createSubject();

    await expect(
      controller.installGithubApp(
        securityUsers.owner,
        response as never,
        String(workspaceId),
      ),
    ).resolves.toBeUndefined();

    expect(authorization.assertPermission).toHaveBeenCalledWith(
      workspaceId,
      1,
      WORKSPACE_PERMISSION.GITHUB_INSTALL_MANAGE,
    );
    expect(githubService.getInstallationUrl).toHaveBeenCalledWith({
      workspaceId,
      userId: 1,
    });
    expect(response.redirect).toHaveBeenCalledWith(
      'https://github.com/apps/devteams/installations/new',
    );
  });

  it('allows workspace admins to start installation', async () => {
    const {controller, githubService, response} = createSubject();

    await expect(
      controller.installGithubApp(
        securityUsers.admin,
        response as never,
        String(workspaceId),
      ),
    ).resolves.toBeUndefined();

    expect(githubService.getInstallationUrl).toHaveBeenCalledWith({
      workspaceId,
      userId: 2,
    });
  });

  it.each([securityUsers.member, securityUsers.outsider])(
    'denies non-admin installation attempts for user %s',
    async user => {
      const {controller, githubService, response} = createSubject();

      await expect(
        controller.installGithubApp(
          user,
          response as never,
          String(workspaceId),
        ),
      ).rejects.toBeInstanceOf(HttpErrors.Forbidden);

      expect(githubService.getInstallationUrl).not.toHaveBeenCalled();
      expect(response.redirect).not.toHaveBeenCalled();
    },
  );

  it('rejects malformed workspace ids before contacting GitHub', async () => {
    const {controller, githubService, response} = createSubject();

    await expect(
      controller.installGithubApp(
        securityUsers.owner,
        response as never,
        'not-a-number',
      ),
    ).rejects.toBeInstanceOf(HttpErrors.BadRequest);

    expect(githubService.getInstallationUrl).not.toHaveBeenCalled();
  });
});
