/* eslint-disable no-constant-condition */
import {BindingScope, Getter, injectable, service} from '@loopback/core';
import {repository} from '@loopback/repository';
import {HttpErrors, Response} from '@loopback/rest';
import {App} from 'octokit';
import {
  GithubRepositoryRepository,
  WorkspaceRepository,
} from '../../repositories';
import {QueueService} from '../queue.service';

type GithubAppInfo = {
  slug: string;
  name: string;
};

type GithubInstallationInfo = {
  id: number;
  account: {
    identifier: string;
    type: string;
  } | null;
  app_id: number;
  app_slug: string;
  target_id: number;
  target_type: string;
  permissions: Record<string, string>;
  events: string[];
  html_url?: string;
};

type GithubInstallationRepository = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
};

type GithubRepositoryIssue = {
  id: number;
  number: number;
  title: string;
  state: string;
  html_url: string;
  body: string | null;
};

type GithubRepositoryPullRequest = {
  id: number;
  number: number;
  title: string;
  state: string;
  merged_at: string | null;
  body: string | null;
  user: {
    id: number;
  } | null;
};

type GithubRepositoryLabel = {
  id: number;
  name: string;
  color: string;
};

@injectable({scope: BindingScope.SINGLETON})
export class GithubService {
  private app: App;
  private clientUrl: string;
  private cachedAppInfo?: GithubAppInfo;

  constructor(
    @repository.getter('WorkspaceRepository')
    private workspaceRepositoryGetter: Getter<WorkspaceRepository>,
    @repository.getter('GithubRepositoryRepository')
    private githubRepositoryRepositoryGetter: Getter<GithubRepositoryRepository>,
    @service(QueueService)
    private queueService: QueueService,
  ) {
    this.app = new App({
      appId: process.env.GITHUB_APP_ID!,
      privateKey: process.env.GITHUB_PRIVATE_KEY!,
      webhooks: {
        secret: process.env.GITHUB_WEBHOOK_SECRET!,
      },
    });
    this.clientUrl = process.env.CLIENT_URL!;
  }

  public async getInstallationUrl(workspaceId?: string): Promise<string> {
    const appInfo = await this.getGithubAppInfo();
    const installationUrl = new URL(
      `/apps/${appInfo.slug}/installations/new`,
      'https://github.com',
    );

    if (workspaceId) {
      installationUrl.searchParams.set('state', workspaceId);
    }

    return installationUrl.toString();
  }

  public async callback(
    response: Response,
    installationId?: string,
    setupAction?: string,
    state?: string,
  ) {
    if (!installationId) {
      throw new HttpErrors.BadRequest(
        'GitHub did not provide the required "installation_id" query parameter',
      );
    }

    const installationIdNumber = Number(installationId);

    if (Number.isNaN(installationIdNumber)) {
      throw new HttpErrors.BadRequest(
        'The "installation_id" query parameter must be a number',
      );
    }

    const callbackUrl = new URL('/workspaces/callback', this.clientUrl);
    const workspaceId = this.parseWorkspaceId(state);

    if (workspaceId) {
      callbackUrl.searchParams.set('workspaceId', workspaceId.toString());
    }

    try {
      const installation = await this.getInstallation(installationIdNumber);

      if (workspaceId) {
        await this.syncWorkspaceInstallation(workspaceId, installationIdNumber);
      }

      const repositories =
        await this.listInstallationRepositories(installationIdNumber);

      console.log('GitHub App installation callback', {
        installationId: installationIdNumber,
        setupAction,
        state,
        workspaceId,
        installation,
      });

      console.log('GitHub App installation repositories', {
        installationId: installationIdNumber,
        count: repositories.length,
        repositories,
      });

      return response.redirect(callbackUrl.toString());
    } catch (error: unknown) {
      console.error('GitHub App installation callback failed', {
        installationId,
        setupAction,
        state,
        error,
      });

      return response.redirect(callbackUrl.toString());
    }
  }

  public async syncInstallationForConnectedWorkspace(
    installationId: number,
  ): Promise<void> {
    const workspaceRepository = await this.workspaceRepositoryGetter();
    const workspace = await workspaceRepository.findOne({
      where: {githubInstallationId: installationId.toString()},
    });

    if (!workspace) {
      console.warn('No workspace connected to GitHub installation', {
        installationId,
      });
      return;
    }

    await this.syncWorkspaceInstallation(workspace.id, installationId);
  }

  public async disconnectInstallation(installationId: number): Promise<void> {
    const workspaceRepository = await this.workspaceRepositoryGetter();
    const githubRepositoryRepository =
      await this.githubRepositoryRepositoryGetter();
    const workspaces = await workspaceRepository.find({
      where: {githubInstallationId: installationId.toString()},
    });

    for (const workspace of workspaces) {
      const repositories = await githubRepositoryRepository.find({
        where: {workspaceId: workspace.id},
      });

      for (const repository of repositories) {
        await githubRepositoryRepository.deleteCascade(repository.id);
      }

      await workspaceRepository.updateById(workspace.id, {
        githubInstallationId: undefined,
        issueSyncDone: false,
        prSyncDone: false,
      });
    }
  }

  private async getGithubAppInfo(): Promise<GithubAppInfo> {
    if (this.cachedAppInfo) {
      return this.cachedAppInfo;
    }

    const response = await this.app.octokit.request('GET /app', {
      headers: {
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.data?.slug || !response.data.name) {
      throw new Error('GitHub App metadata is missing slug or name');
    }

    this.cachedAppInfo = {
      slug: response.data.slug,
      name: response.data.name,
    };

    return {
      ...this.cachedAppInfo,
    };
  }

  private parseWorkspaceId(state?: string): number | undefined {
    if (!state) {
      return undefined;
    }

    const workspaceId = Number(state.trim());

    if (!workspaceId || Number.isNaN(workspaceId)) {
      console.warn('GitHub App callback received invalid workspace state', {
        state,
      });
      return undefined;
    }

    return workspaceId;
  }

  private async saveInstallationRepositories(
    workspaceId: number,
    installationId: number,
    repositories: GithubInstallationRepository[],
  ) {
    const workspaceRepository = await this.workspaceRepositoryGetter();
    const githubRepositoryRepository =
      await this.githubRepositoryRepositoryGetter();

    await workspaceRepository.updateById(workspaceId, {
      githubInstallationId: installationId.toString(),
      issueSyncDone: false,
      prSyncDone: false,
    });

    const existingRepositories = await githubRepositoryRepository.find({
      where: {workspaceId},
    });
    const existingByGithubRepoId = new Map(
      existingRepositories.map(repository => [
        repository.githubRepoId,
        repository,
      ]),
    );
    const incomingGithubRepoIds = new Set(
      repositories.map(repository => repository.id),
    );

    for (const repository of repositories) {
      const existingRepository = existingByGithubRepoId.get(repository.id);

      if (!existingRepository) {
        await githubRepositoryRepository.create({
          workspaceId,
          githubRepoId: repository.id,
          name: repository.name,
          fullName: repository.full_name,
        });
        continue;
      }

      if (
        existingRepository.name !== repository.name ||
        existingRepository.fullName !== repository.full_name
      ) {
        await githubRepositoryRepository.updateById(existingRepository.id, {
          name: repository.name,
          fullName: repository.full_name,
        });
      }
    }

    for (const existingRepository of existingRepositories) {
      if (incomingGithubRepoIds.has(existingRepository.githubRepoId)) {
        continue;
      }

      await githubRepositoryRepository.deleteCascade(existingRepository.id);
    }
  }

  private async syncWorkspaceInstallation(
    workspaceId: number,
    installationId: number,
  ): Promise<void> {
    const repositories =
      await this.listInstallationRepositories(installationId);

    await this.saveInstallationRepositories(
      workspaceId,
      installationId,
      repositories,
    );
    await this.queueService.enqueueGithubLabelsSync({
      installationId,
      workspaceId,
    });
    await this.queueService.enqueueGithubIssuesSync({
      installationId,
      workspaceId,
    });
  }

  private async getInstallation(
    installationId: number,
  ): Promise<GithubInstallationInfo> {
    const response = await this.app.octokit.request(
      'GET /app/installations/{installation_id}',
      {
        installation_id: installationId,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );
    const account = response.data.account;

    return {
      id: response.data.id,
      account: account
        ? {
            identifier:
              'login' in account
                ? account.login
                : 'name' in account
                  ? account.name
                  : 'unknown',
            type: 'type' in account ? account.type : 'Organization',
          }
        : null,
      app_id: response.data.app_id,
      app_slug: response.data.app_slug,
      target_id: response.data.target_id,
      target_type: response.data.target_type,
      permissions: response.data.permissions,
      events: response.data.events,
      html_url: response.data.html_url,
    };
  }

  private async getInstallationClient(
    installationId: number,
  ): ReturnType<App['getInstallationOctokit']> {
    return this.app.getInstallationOctokit(installationId);
  }

  public async listRepositoryIssuesPage(
    installationId: number,
    repositoryFullName: string,
    page: number,
    perPage: number,
  ): Promise<GithubRepositoryIssue[]> {
    const [owner, repo] = repositoryFullName.split('/');

    if (!owner || !repo) {
      console.warn('Unable to resolve repository owner/name for issue sync', {
        repositoryFullName,
      });
      return [];
    }

    const octokit = await this.getInstallationClient(installationId);
    const response = await octokit.request('GET /repos/{owner}/{repo}/issues', {
      owner,
      repo,
      page,
      per_page: perPage,
      state: 'all',
      headers: {
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    return response.data
      .filter(issue => !('pull_request' in issue))
      .map(issue => ({
        id: issue.id,
        number: issue.number,
        title: issue.title,
        state: issue.state,
        html_url: issue.html_url,
        body: issue.body ?? null,
      }));
  }

  public async listRepositoryPullRequestsPage(
    installationId: number,
    repositoryFullName: string,
    page: number,
    perPage: number,
  ): Promise<GithubRepositoryPullRequest[]> {
    const [owner, repo] = repositoryFullName.split('/');

    if (!owner || !repo) {
      console.warn(
        'Unable to resolve repository owner/name for pull request sync',
        {
          repositoryFullName,
        },
      );
      return [];
    }

    const octokit = await this.getInstallationClient(installationId);
    const response = await octokit.request('GET /repos/{owner}/{repo}/pulls', {
      owner,
      repo,
      page,
      per_page: perPage,
      state: 'all',
      headers: {
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    return response.data.map(pullRequest => ({
      id: pullRequest.id,
      number: pullRequest.number,
      title: pullRequest.title,
      state: pullRequest.state,
      merged_at: pullRequest.merged_at,
      body: pullRequest.body ?? null,
      user: pullRequest.user ? {id: pullRequest.user.id} : null,
    }));
  }

  public async syncRepositoryLabels(
    installationId: number,
    repositoryFullName: string,
  ): Promise<GithubRepositoryLabel[]> {
    const [owner, repo] = repositoryFullName.split('/');

    if (!owner || !repo) {
      console.warn('Unable to resolve repository owner/name for label sync', {
        repositoryFullName,
      });
      return [];
    }

    const octokit = await this.getInstallationClient(installationId);
    const priorityLabels = [
      {name: 'Priority: Unknown', color: '8b5cf6'},
      {name: 'Priority: Low', color: '22c55e'},
      {name: 'Priority: Medium', color: 'eab308'},
      {name: 'Priority: High', color: 'f97316'},
      {name: 'Priority: VeryHigh', color: 'ef4444'},
    ];
    const syncedLabels: GithubRepositoryLabel[] = [];

    for (const label of priorityLabels) {
      try {
        const response = await octokit.request(
          'POST /repos/{owner}/{repo}/labels',
          {
            owner,
            repo,
            name: label.name,
            color: label.color,
            headers: {
              'X-GitHub-Api-Version': '2022-11-28',
            },
          },
        );

        syncedLabels.push({
          id: response.data.id,
          name: response.data.name,
          color: response.data.color,
        });
      } catch (error: unknown) {
        const status = (error as {status?: number})?.status;

        if (status !== 422) {
          throw error;
        }

        const response = await octokit.request(
          'GET /repos/{owner}/{repo}/labels/{name}',
          {
            owner,
            repo,
            name: label.name,
            headers: {
              'X-GitHub-Api-Version': '2022-11-28',
            },
          },
        );

        if (response.data.color.toLowerCase() !== label.color) {
          await octokit.request('PATCH /repos/{owner}/{repo}/labels/{name}', {
            owner,
            repo,
            name: label.name,
            new_name: label.name,
            color: label.color,
            headers: {
              'X-GitHub-Api-Version': '2022-11-28',
            },
          });
        }

        syncedLabels.push({
          id: response.data.id,
          name: response.data.name,
          color: label.color,
        });
      }
    }

    return syncedLabels;
  }

  private async listInstallationRepositories(
    installationId: number,
  ): Promise<GithubInstallationRepository[]> {
    const octokit = await this.getInstallationClient(installationId);
    const repositories: GithubInstallationRepository[] = [];
    const perPage = 100;
    let page = 1;

    while (true) {
      const response = await octokit.request('GET /installation/repositories', {
        per_page: perPage,
        page,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
      const pageRepositories = response.data.repositories.map(repository => ({
        id: repository.id,
        name: repository.name,
        full_name: repository.full_name,
        private: repository.private,
        html_url: repository.html_url,
      }));

      repositories.push(...pageRepositories);

      if (pageRepositories.length < perPage) {
        break;
      }

      page += 1;
    }

    return repositories;
  }
}
