import {beforeEach, describe, expect, it, vi} from 'vitest';

import {GithubWebhookService} from '../../../services/github-integration/github-webhook.service';

describe('GithubWebhookService (unit)', () => {
  let githubService: {
    syncInstallationForConnectedWorkspace: ReturnType<typeof vi.fn>;
    disconnectInstallation: ReturnType<typeof vi.fn>;
  };
  let service: GithubWebhookService;

  beforeEach(() => {
    process.env.GITHUB_APP_ID = '1';
    process.env.GITHUB_PRIVATE_KEY = 'private-key';
    process.env.GITHUB_WEBHOOK_SECRET = 'webhook-secret';

    githubService = {
      syncInstallationForConnectedWorkspace: vi
        .fn()
        .mockResolvedValue(undefined),
      disconnectInstallation: vi.fn().mockResolvedValue(undefined),
    };

    service = new GithubWebhookService(githubService as never);
  });

  it('syncs a connected workspace when an installation is created', async () => {
    await service.handleWebhook('installation', {
      action: 'created',
      installation: {id: 123},
    });

    expect(
      githubService.syncInstallationForConnectedWorkspace,
    ).toHaveBeenCalledWith(123);
    expect(githubService.disconnectInstallation).not.toHaveBeenCalled();
  });

  it('disconnects a workspace when an installation is deleted', async () => {
    await service.handleWebhook('installation', {
      action: 'deleted',
      installation: {id: 123},
    });

    expect(githubService.disconnectInstallation).toHaveBeenCalledWith(123);
    expect(
      githubService.syncInstallationForConnectedWorkspace,
    ).not.toHaveBeenCalled();
  });

  it('syncs a connected workspace when repositories are added to an installation', async () => {
    await service.handleWebhook('installation_repositories', {
      action: 'added',
      installation: {id: 123},
    });

    expect(
      githubService.syncInstallationForConnectedWorkspace,
    ).toHaveBeenCalledWith(123);
  });

  it('syncs a connected workspace when repositories are removed from an installation', async () => {
    await service.handleWebhook('installation_repositories', {
      action: 'removed',
      installation: {id: 123},
    });

    expect(
      githubService.syncInstallationForConnectedWorkspace,
    ).toHaveBeenCalledWith(123);
  });
});
