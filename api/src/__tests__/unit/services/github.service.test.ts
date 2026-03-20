import {beforeEach, describe, expect, it, vi} from 'vitest';

import {GithubService} from '../../../services/github-integration/github.service';

type GithubInstallationRepository = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
};

type GithubServiceInternals = {
  saveInstallationRepositories(
    workspaceId: number,
    installationId: number,
    repositories: GithubInstallationRepository[],
  ): Promise<void>;
  syncWorkspaceInstallation(
    workspaceId: number,
    installationId: number,
  ): Promise<void>;
};

describe('GithubService (unit)', () => {
  let workspaceRepository: {
    updateById: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
  };
  let githubRepositoryRepository: {
    find: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    updateById: ReturnType<typeof vi.fn>;
    deleteCascade: ReturnType<typeof vi.fn>;
  };
  let queueService: {
    enqueueGithubIssuesSync: ReturnType<typeof vi.fn>;
  };
  let service: GithubService;
  let internals: GithubServiceInternals;

  beforeEach(() => {
    process.env.GITHUB_APP_ID = '1';
    process.env.GITHUB_PRIVATE_KEY = 'private-key';
    process.env.GITHUB_WEBHOOK_SECRET = 'webhook-secret';
    process.env.CLIENT_URL = 'https://client.example.com';

    workspaceRepository = {
      updateById: vi.fn().mockResolvedValue(undefined),
      findOne: vi.fn(),
      find: vi.fn(),
    };
    githubRepositoryRepository = {
      find: vi.fn(),
      create: vi.fn().mockResolvedValue(undefined),
      updateById: vi.fn().mockResolvedValue(undefined),
      deleteCascade: vi.fn().mockResolvedValue(undefined),
    };
    queueService = {
      enqueueGithubIssuesSync: vi.fn().mockResolvedValue(undefined),
    };

    service = new GithubService(
      async () => workspaceRepository as never,
      async () => githubRepositoryRepository as never,
      queueService as never,
    );
    internals = service as unknown as GithubServiceInternals;
  });

  it('reconciles installation repositories without deleting unchanged rows', async () => {
    githubRepositoryRepository.find.mockResolvedValue([
      {
        id: 11,
        workspaceId: 7,
        githubRepoId: 1001,
        name: 'api',
        fullName: 'team/api',
      },
      {
        id: 12,
        workspaceId: 7,
        githubRepoId: 1002,
        name: 'old-web',
        fullName: 'team/old-web',
      },
    ]);

    await internals.saveInstallationRepositories(7, 99, [
      {
        id: 1001,
        name: 'api',
        full_name: 'team/platform-api',
        private: true,
        html_url: 'https://github.com/team/platform-api',
      },
      {
        id: 1003,
        name: 'worker',
        full_name: 'team/worker',
        private: true,
        html_url: 'https://github.com/team/worker',
      },
    ]);

    expect(workspaceRepository.updateById).toHaveBeenCalledWith(7, {
      githubInstallationId: '99',
    });
    expect(githubRepositoryRepository.find).toHaveBeenCalledWith({
      where: {workspaceId: 7},
    });
    expect(githubRepositoryRepository.updateById).toHaveBeenCalledWith(11, {
      name: 'api',
      fullName: 'team/platform-api',
    });
    expect(githubRepositoryRepository.create).toHaveBeenCalledWith({
      workspaceId: 7,
      githubRepoId: 1003,
      name: 'worker',
      fullName: 'team/worker',
    });
    expect(githubRepositoryRepository.deleteCascade).toHaveBeenCalledWith(12);
    expect(githubRepositoryRepository.deleteCascade).toHaveBeenCalledTimes(1);
  });

  it('does not create, update, or delete when repositories are already in sync', async () => {
    githubRepositoryRepository.find.mockResolvedValue([
      {
        id: 21,
        workspaceId: 5,
        githubRepoId: 2001,
        name: 'api',
        fullName: 'team/api',
      },
    ]);

    await internals.saveInstallationRepositories(5, 55, [
      {
        id: 2001,
        name: 'api',
        full_name: 'team/api',
        private: false,
        html_url: 'https://github.com/team/api',
      },
    ]);

    expect(githubRepositoryRepository.create).not.toHaveBeenCalled();
    expect(githubRepositoryRepository.updateById).not.toHaveBeenCalled();
    expect(githubRepositoryRepository.deleteCascade).not.toHaveBeenCalled();
  });

  it('syncs the workspace linked to an installation id', async () => {
    workspaceRepository.findOne.mockResolvedValue({id: 42});
    const syncWorkspaceInstallationSpy = vi
      .spyOn(internals, 'syncWorkspaceInstallation')
      .mockResolvedValue(undefined);

    await service.syncInstallationForConnectedWorkspace(77);

    expect(workspaceRepository.findOne).toHaveBeenCalledWith({
      where: {githubInstallationId: '77'},
    });
    expect(syncWorkspaceInstallationSpy).toHaveBeenCalledWith(42, 77);
  });

  it('disconnects an installation and deletes its repositories with cascade', async () => {
    workspaceRepository.find.mockResolvedValue([{id: 9}]);
    githubRepositoryRepository.find.mockResolvedValue([
      {id: 3, workspaceId: 9},
    ]);

    await service.disconnectInstallation(77);

    expect(workspaceRepository.find).toHaveBeenCalledWith({
      where: {githubInstallationId: '77'},
    });
    expect(githubRepositoryRepository.find).toHaveBeenCalledWith({
      where: {workspaceId: 9},
    });
    expect(githubRepositoryRepository.deleteCascade).toHaveBeenCalledWith(3);
    expect(workspaceRepository.updateById).toHaveBeenCalledWith(9, {
      githubInstallationId: undefined,
    });
  });
});
