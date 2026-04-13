/* eslint-disable no-constant-condition */
import {BindingScope, Getter, injectable, service} from '@loopback/core';
import {repository} from '@loopback/repository';
import {HttpErrors, Response} from '@loopback/rest';
import {createHmac, timingSafeEqual} from 'crypto';
import {App} from 'octokit';
import {
  IssuePriorityService,
  type IssuePriorityPrediction,
} from '../issue-priority.service';
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
  draft: boolean;
  user: {
    id: number;
  } | null;
};

type GithubPullRequestOverview = {
  number: number;
  title: string;
  body: string | null;
  state: string;
  draft: boolean;
  mergeable_state: string | null;
  additions: number;
  deletions: number;
  changed_files: number;
  commits: number;
  base_ref: string | null;
  head_ref: string | null;
  head_sha: string | null;
  requested_reviewer_logins: string[];
};

type GithubPullRequestFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  previous_filename?: string;
};

type GithubPullRequestReviewCommentInput = {
  path: string;
  line?: number;
  body: string;
  lineContent?: string;
};

type GithubRepositoryLabel = {
  id: number;
  name: string;
  color: string;
};

const AI_REVIEW_COMMENT_MARKER = '<!-- onlab-ai-review-comment -->';
const AI_REVIEWER_SUGGESTION_COMMENT_MARKER =
  '<!-- onlab-ai-reviewer-suggestions-comment -->';
const INSTALLATION_STATE_TTL_MS = 15 * 60 * 1000;

@injectable({scope: BindingScope.SINGLETON})
export class GithubService {
  private app: App;
  private clientUrl: string;
  private appStateSecret: string;
  private cachedAppInfo?: GithubAppInfo;

  constructor(
    @repository.getter('WorkspaceRepository')
    private workspaceRepositoryGetter: Getter<WorkspaceRepository>,
    @repository.getter('GithubRepositoryRepository')
    private githubRepositoryRepositoryGetter: Getter<GithubRepositoryRepository>,
    @service(QueueService)
    private queueService: QueueService,
    @service(IssuePriorityService)
    private issuePriorityService: IssuePriorityService,
  ) {
    this.app = new App({
      appId: process.env.GITHUB_APP_ID!,
      privateKey: process.env.GITHUB_PRIVATE_KEY!,
      webhooks: {
        secret: process.env.GITHUB_WEBHOOK_SECRET!,
      },
    });
    this.clientUrl = process.env.CLIENT_URL!;
    this.appStateSecret =
      process.env.GITHUB_APP_STATE_SECRET ?? process.env.GITHUB_WEBHOOK_SECRET!;
  }

  public async getInstallationUrl(workspaceId?: string): Promise<string> {
    const appInfo = await this.getGithubAppInfo();
    const installationUrl = new URL(
      `/apps/${appInfo.slug}/installations/new`,
      'https://github.com',
    );

    if (workspaceId) {
      installationUrl.searchParams.set(
        'state',
        this.createInstallationStateToken(workspaceId),
      );
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

    const [workspaceIdText, issuedAtText, signature] = state.trim().split('.');

    if (!workspaceIdText || !issuedAtText || !signature) {
      console.warn('GitHub App callback received invalid workspace state', {
        state,
      });
      return undefined;
    }

    const workspaceId = Number(workspaceIdText);
    const issuedAt = Number(issuedAtText);

    if (
      !workspaceId ||
      Number.isNaN(workspaceId) ||
      !issuedAt ||
      Number.isNaN(issuedAt)
    ) {
      console.warn('GitHub App callback received invalid workspace state', {
        state,
      });
      return undefined;
    }

    if (Date.now() - issuedAt > INSTALLATION_STATE_TTL_MS) {
      console.warn('GitHub App callback received expired workspace state', {
        workspaceId,
        issuedAt,
      });
      return undefined;
    }

    const signedPayload = `${workspaceId}.${issuedAt}`;
    const expectedSignature = createHmac('sha256', this.appStateSecret)
      .update(signedPayload)
      .digest('hex');

    if (
      signature.length !== expectedSignature.length ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
    ) {
      console.warn('GitHub App callback received tampered workspace state', {
        workspaceId,
      });
      return undefined;
    }

    return workspaceId;
  }

  private createInstallationStateToken(workspaceId: string): string {
    const normalizedWorkspaceId = workspaceId.trim();
    const issuedAt = Date.now();
    const signedPayload = `${normalizedWorkspaceId}.${issuedAt}`;
    const signature = createHmac('sha256', this.appStateSecret)
      .update(signedPayload)
      .digest('hex');

    return `${signedPayload}.${signature}`;
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

  public async createIssue(
    installationId: number,
    repositoryFullName: string,
    title: string,
    description: string | null,
  ): Promise<GithubRepositoryIssue> {
    const repositoryCoordinates = this.getRepositoryCoordinates(
      repositoryFullName,
      'issue creation',
    );

    if (!repositoryCoordinates) {
      throw new HttpErrors.BadRequest(
        'Unable to resolve repository owner/name for issue creation',
      );
    }

    const {owner, repo} = repositoryCoordinates;
    const octokit = await this.getInstallationClient(installationId);
    const response = await octokit.request(
      'POST /repos/{owner}/{repo}/issues',
      {
        owner,
        repo,
        title,
        body: description ?? undefined,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );

    return {
      id: response.data.id,
      number: response.data.number,
      title: response.data.title,
      state: response.data.state,
      html_url: response.data.html_url,
      body: response.data.body ?? null,
    };
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
      draft: pullRequest.draft ?? false,
      user: pullRequest.user ? {id: pullRequest.user.id} : null,
    }));
  }

  public async getPullRequestOverview(
    installationId: number,
    repositoryFullName: string,
    pullRequestNumber: number,
  ): Promise<GithubPullRequestOverview> {
    const repositoryCoordinates = this.getRepositoryCoordinates(
      repositoryFullName,
      'pull request overview lookup',
    );

    if (!repositoryCoordinates) {
      throw new HttpErrors.BadRequest(
        'Unable to resolve repository owner/name for pull request overview lookup',
      );
    }

    const {owner, repo} = repositoryCoordinates;
    const octokit = await this.getInstallationClient(installationId);
    const response = await octokit.request(
      'GET /repos/{owner}/{repo}/pulls/{pull_number}',
      {
        owner,
        repo,
        pull_number: pullRequestNumber,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );

    return {
      number: response.data.number,
      title: response.data.title,
      body: response.data.body ?? null,
      state: response.data.state,
      draft: response.data.draft ?? false,
      mergeable_state: response.data.mergeable_state ?? null,
      additions: response.data.additions ?? 0,
      deletions: response.data.deletions ?? 0,
      changed_files: response.data.changed_files ?? 0,
      commits: response.data.commits ?? 0,
      base_ref: response.data.base?.ref ?? null,
      head_ref: response.data.head?.ref ?? null,
      head_sha: response.data.head?.sha ?? null,
      requested_reviewer_logins:
        response.data.requested_reviewers?.map(reviewer => reviewer.login) ??
        [],
    };
  }

  public async listPullRequestFiles(
    installationId: number,
    repositoryFullName: string,
    pullRequestNumber: number,
  ): Promise<GithubPullRequestFile[]> {
    const repositoryCoordinates = this.getRepositoryCoordinates(
      repositoryFullName,
      'pull request file lookup',
    );

    if (!repositoryCoordinates) {
      throw new HttpErrors.BadRequest(
        'Unable to resolve repository owner/name for pull request file lookup',
      );
    }

    const {owner, repo} = repositoryCoordinates;
    const octokit = await this.getInstallationClient(installationId);
    const files: GithubPullRequestFile[] = [];
    let page = 1;
    let hasMoreFiles = true;

    while (hasMoreFiles) {
      const response = await octokit.request(
        'GET /repos/{owner}/{repo}/pulls/{pull_number}/files',
        {
          owner,
          repo,
          pull_number: pullRequestNumber,
          page,
          per_page: 100,
          headers: {
            'X-GitHub-Api-Version': '2022-11-28',
          },
        },
      );

      files.push(
        ...response.data.map(file => ({
          filename: file.filename,
          status: file.status,
          additions: file.additions ?? 0,
          deletions: file.deletions ?? 0,
          changes: file.changes ?? 0,
          patch: file.patch ?? undefined,
          previous_filename: file.previous_filename ?? undefined,
        })),
      );

      hasMoreFiles = response.data.length === 100;
      page += 1;
    }

    return files;
  }

  public async getPullRequestFileContents(
    installationId: number,
    repositoryFullName: string,
    pullRequestNumber: number,
    path: string,
  ): Promise<string> {
    const repositoryCoordinates = this.getRepositoryCoordinates(
      repositoryFullName,
      'pull request file content lookup',
    );

    if (!repositoryCoordinates) {
      throw new HttpErrors.BadRequest(
        'Unable to resolve repository owner/name for pull request file content lookup',
      );
    }

    const overview = await this.getPullRequestOverview(
      installationId,
      repositoryFullName,
      pullRequestNumber,
    );
    const {owner, repo} = repositoryCoordinates;
    const octokit = await this.getInstallationClient(installationId);
    const response = await octokit.request(
      'GET /repos/{owner}/{repo}/contents/{path}',
      {
        owner,
        repo,
        path,
        ref: overview.head_sha ?? undefined,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );

    if (typeof response.data === 'string') {
      return response.data;
    }

    if (
      response.data &&
      typeof response.data === 'object' &&
      'content' in response.data &&
      typeof response.data.content === 'string'
    ) {
      return Buffer.from(
        response.data.content,
        response.data.encoding === 'base64' ? 'base64' : 'utf8',
      ).toString('utf8');
    }

    return '';
  }

  public async syncRepositoryLabels(
    installationId: number,
    repositoryFullName: string,
  ): Promise<GithubRepositoryLabel[]> {
    const repositoryCoordinates = this.getRepositoryCoordinates(
      repositoryFullName,
      'label sync',
    );

    if (!repositoryCoordinates) {
      return [];
    }

    const {owner, repo} = repositoryCoordinates;
    const octokit = await this.getInstallationClient(installationId);
    const syncedLabels: GithubRepositoryLabel[] = [];

    for (const label of [
      ...this.getPriorityLabels(),
      ...this.getRiskLabels(),
    ]) {
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

  public async applyPriorityPredictionToIssue(
    installationId: number,
    repositoryFullName: string,
    issueNumber: number,
    prediction: IssuePriorityPrediction,
    description: string | null,
    processingReactionId?: number | null,
  ): Promise<void> {
    const repositoryCoordinates = this.getRepositoryCoordinates(
      repositoryFullName,
      'issue priority update',
    );

    if (!repositoryCoordinates) {
      return;
    }

    const {owner, repo} = repositoryCoordinates;
    const octokit = await this.getInstallationClient(installationId);
    const currentIssueResponse = await octokit.request(
      'GET /repos/{owner}/{repo}/issues/{issue_number}',
      {
        owner,
        repo,
        issue_number: issueNumber,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );
    const priorityLabels = this.getPriorityLabels().map(label => label.name);
    const activePriorityLabel = this.issuePriorityService.getPriorityLabelName(
      prediction.priority,
    );

    for (const priorityLabel of priorityLabels) {
      if (priorityLabel === activePriorityLabel) {
        continue;
      }

      try {
        await octokit.request(
          'DELETE /repos/{owner}/{repo}/issues/{issue_number}/labels/{name}',
          {
            owner,
            repo,
            issue_number: issueNumber,
            name: priorityLabel,
            headers: {
              'X-GitHub-Api-Version': '2022-11-28',
            },
          },
        );
      } catch (error: unknown) {
        const status = (error as {status?: number})?.status;

        if (status !== 404) {
          throw error;
        }
      }
    }

    await octokit.request(
      'POST /repos/{owner}/{repo}/issues/{issue_number}/labels',
      {
        owner,
        repo,
        issue_number: issueNumber,
        labels: [activePriorityLabel],
        headers: {
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );

    const nextBody = this.issuePriorityService.upsertPredictionNote(
      description,
      prediction,
    );

    if ((currentIssueResponse.data.body ?? '') !== nextBody) {
      await octokit.request(
        'PATCH /repos/{owner}/{repo}/issues/{issue_number}',
        {
          owner,
          repo,
          issue_number: issueNumber,
          body: nextBody,
          headers: {
            'X-GitHub-Api-Version': '2022-11-28',
          },
        },
      );
    }

    await this.unmarkIssueAsProcessing(
      installationId,
      repositoryFullName,
      issueNumber,
      processingReactionId,
    );
  }

  public async applyMergeRiskPredictionToPullRequest(
    installationId: number,
    repositoryFullName: string,
    pullRequestNumber: number,
    prediction: IssuePriorityPrediction,
    description: string | null,
    processingReactionId?: number | null,
  ): Promise<void> {
    const repositoryCoordinates = this.getRepositoryCoordinates(
      repositoryFullName,
      'pull request merge risk update',
    );

    if (!repositoryCoordinates) {
      return;
    }

    const {owner, repo} = repositoryCoordinates;
    const octokit = await this.getInstallationClient(installationId);
    const overview = await this.getPullRequestOverview(
      installationId,
      repositoryFullName,
      pullRequestNumber,
    );
    const riskLabels = this.getRiskLabels().map(label => label.name);
    const activeRiskLabel = this.issuePriorityService.getRiskLabelName(
      prediction.priority,
    );

    for (const riskLabel of riskLabels) {
      if (riskLabel === activeRiskLabel) {
        continue;
      }

      try {
        await octokit.request(
          'DELETE /repos/{owner}/{repo}/issues/{issue_number}/labels/{name}',
          {
            owner,
            repo,
            issue_number: pullRequestNumber,
            name: riskLabel,
            headers: {
              'X-GitHub-Api-Version': '2022-11-28',
            },
          },
        );
      } catch (error: unknown) {
        const status = (error as {status?: number})?.status;

        if (status !== 404) {
          throw error;
        }
      }
    }

    await octokit.request(
      'POST /repos/{owner}/{repo}/issues/{issue_number}/labels',
      {
        owner,
        repo,
        issue_number: pullRequestNumber,
        labels: [activeRiskLabel],
        headers: {
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );

    const nextBody = this.issuePriorityService.upsertPredictionNote(
      description,
      prediction,
      {kind: 'risk'},
    );

    if ((overview.body ?? '') !== nextBody) {
      await octokit.request('PATCH /repos/{owner}/{repo}/pulls/{pull_number}', {
        owner,
        repo,
        pull_number: pullRequestNumber,
        body: nextBody,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
    }

    await this.unmarkPullRequestAsProcessing(
      installationId,
      repositoryFullName,
      pullRequestNumber,
      processingReactionId,
    );
  }

  public async syncPullRequestReviewComments(
    installationId: number,
    repositoryFullName: string,
    pullRequestNumber: number,
    findings: GithubPullRequestReviewCommentInput[],
  ): Promise<void> {
    const repositoryCoordinates = this.getRepositoryCoordinates(
      repositoryFullName,
      'pull request review comment sync',
    );

    if (!repositoryCoordinates) {
      return;
    }

    const {owner, repo} = repositoryCoordinates;
    const octokit = await this.getInstallationClient(installationId);

    await this.deleteExistingAiPullRequestReviewComments(
      octokit,
      owner,
      repo,
      pullRequestNumber,
    );

    if (!findings.length) {
      return;
    }

    const overview = await this.getPullRequestOverview(
      installationId,
      repositoryFullName,
      pullRequestNumber,
    );
    const files = await this.listPullRequestFiles(
      installationId,
      repositoryFullName,
      pullRequestNumber,
    );
    const validFindings = findings
      .map(finding =>
        resolvePullRequestReviewCommentLocation(
          files.find(file => file.filename === finding.path),
          finding,
        ),
      )
      .filter(
        (
          finding,
        ): finding is GithubPullRequestReviewCommentInput & {line: number} =>
          finding !== null,
      );

    if (!validFindings.length) {
      return;
    }

    await octokit.request(
      'POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews',
      {
        owner,
        repo,
        pull_number: pullRequestNumber,
        commit_id: overview.head_sha ?? undefined,
        event: 'COMMENT',
        body: 'DevTeams AI review findings.',
        comments: validFindings.map(finding => ({
          path: finding.path,
          line: finding.line,
          side: 'RIGHT',
          body: buildAiReviewCommentBody(finding.body),
        })),
        headers: {
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );
  }

  public async requestPullRequestReviewers(
    installationId: number,
    repositoryFullName: string,
    pullRequestNumber: number,
    reviewerLogins: string[],
  ): Promise<void> {
    const normalizedReviewerLogins = Array.from(
      new Set(
        reviewerLogins
          .map(login => login.trim())
          .filter(login => Boolean(login)),
      ),
    );

    if (!normalizedReviewerLogins.length) {
      console.log('Pull request reviewer request skipped: no reviewer logins', {
        repositoryFullName,
        pullRequestNumber,
      });
      return;
    }

    const repositoryCoordinates = this.getRepositoryCoordinates(
      repositoryFullName,
      'pull request reviewer request sync',
    );

    if (!repositoryCoordinates) {
      return;
    }

    const {owner, repo} = repositoryCoordinates;
    const octokit = await this.getInstallationClient(installationId);
    const overview = await this.getPullRequestOverview(
      installationId,
      repositoryFullName,
      pullRequestNumber,
    );
    const existingRequestedReviewers = new Set(
      overview.requested_reviewer_logins.map(login => login.toLowerCase()),
    );
    const reviewersToRequest = normalizedReviewerLogins.filter(
      login => !existingRequestedReviewers.has(login.toLowerCase()),
    );

    if (!reviewersToRequest.length) {
      console.log(
        'Pull request reviewer request skipped: all reviewers already requested',
        {
          repositoryFullName,
          pullRequestNumber,
          normalizedReviewerLogins,
          existingRequestedReviewers: Array.from(existingRequestedReviewers),
        },
      );
      return;
    }

    console.log('Pull request reviewer request submitting to GitHub', {
      repositoryFullName,
      pullRequestNumber,
      reviewersToRequest,
    });

    await octokit.request(
      'POST /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers',
      {
        owner,
        repo,
        pull_number: pullRequestNumber,
        reviewers: reviewersToRequest,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );

    console.log('Pull request reviewer request completed', {
      repositoryFullName,
      pullRequestNumber,
      reviewersToRequest,
    });
  }

  public async syncPullRequestReviewerSuggestionComment(
    installationId: number,
    repositoryFullName: string,
    pullRequestNumber: number,
    reviewerSuggestions: Array<{
      username: string;
      reason: string;
    }>,
  ): Promise<void> {
    const repositoryCoordinates = this.getRepositoryCoordinates(
      repositoryFullName,
      'pull request reviewer suggestion comment sync',
    );

    if (!repositoryCoordinates) {
      return;
    }

    const {owner, repo} = repositoryCoordinates;
    const octokit = await this.getInstallationClient(installationId);

    await this.deleteExistingAiPullRequestIssueComments(
      octokit,
      owner,
      repo,
      pullRequestNumber,
      AI_REVIEWER_SUGGESTION_COMMENT_MARKER,
    );

    const commentBody =
      buildAiReviewerSuggestionCommentBody(reviewerSuggestions);

    if (!commentBody) {
      return;
    }

    await octokit.request(
      'POST /repos/{owner}/{repo}/issues/{issue_number}/comments',
      {
        owner,
        repo,
        issue_number: pullRequestNumber,
        body: commentBody,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );
  }

  public async markIssueAsProcessing(
    installationId: number,
    repositoryFullName: string,
    issueNumber: number,
  ): Promise<number | null> {
    const repositoryCoordinates = this.getRepositoryCoordinates(
      repositoryFullName,
      'issue processing marker update',
    );

    if (!repositoryCoordinates) {
      return null;
    }

    const {owner, repo} = repositoryCoordinates;
    const octokit = await this.getInstallationClient(installationId);

    const response = await octokit.request(
      'POST /repos/{owner}/{repo}/issues/{issue_number}/reactions',
      {
        owner,
        repo,
        issue_number: issueNumber,
        content: 'eyes',
        headers: {
          accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );

    return response.data.id ?? null;
  }

  public async markPullRequestAsProcessing(
    installationId: number,
    repositoryFullName: string,
    pullRequestNumber: number,
  ): Promise<number | null> {
    const repositoryCoordinates = this.getRepositoryCoordinates(
      repositoryFullName,
      'pull request processing marker update',
    );

    if (!repositoryCoordinates) {
      return null;
    }

    const {owner, repo} = repositoryCoordinates;
    const octokit = await this.getInstallationClient(installationId);

    const response = await octokit.request(
      'POST /repos/{owner}/{repo}/issues/{issue_number}/reactions',
      {
        owner,
        repo,
        issue_number: pullRequestNumber,
        content: 'eyes',
        headers: {
          accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );

    return response.data.id ?? null;
  }

  public async unmarkIssueAsProcessing(
    installationId: number,
    repositoryFullName: string,
    issueNumber: number,
    reactionId?: number | null,
  ): Promise<void> {
    const repositoryCoordinates = this.getRepositoryCoordinates(
      repositoryFullName,
      'issue processing marker cleanup',
    );

    if (!repositoryCoordinates) {
      return;
    }

    const {owner, repo} = repositoryCoordinates;
    const octokit = await this.getInstallationClient(installationId);

    if (reactionId) {
      await octokit.request(
        'DELETE /repos/{owner}/{repo}/issues/{issue_number}/reactions/{reaction_id}',
        {
          owner,
          repo,
          issue_number: issueNumber,
          reaction_id: reactionId,
          headers: {
            accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        },
      );
      return;
    }

    const response = await octokit.request(
      'GET /repos/{owner}/{repo}/issues/{issue_number}/reactions',
      {
        owner,
        repo,
        issue_number: issueNumber,
        headers: {
          accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );
    const reactionsToRemove = response.data.filter(
      reaction => reaction.content === 'eyes' && reaction.user?.type === 'Bot',
    );

    for (const reaction of reactionsToRemove) {
      await octokit.request(
        'DELETE /repos/{owner}/{repo}/issues/{issue_number}/reactions/{reaction_id}',
        {
          owner,
          repo,
          issue_number: issueNumber,
          reaction_id: reaction.id,
          headers: {
            accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        },
      );
    }
  }

  public async unmarkPullRequestAsProcessing(
    installationId: number,
    repositoryFullName: string,
    pullRequestNumber: number,
    reactionId?: number | null,
  ): Promise<void> {
    const repositoryCoordinates = this.getRepositoryCoordinates(
      repositoryFullName,
      'pull request processing marker cleanup',
    );

    if (!repositoryCoordinates) {
      return;
    }

    const {owner, repo} = repositoryCoordinates;
    const octokit = await this.getInstallationClient(installationId);

    if (reactionId) {
      await octokit.request(
        'DELETE /repos/{owner}/{repo}/issues/{issue_number}/reactions/{reaction_id}',
        {
          owner,
          repo,
          issue_number: pullRequestNumber,
          reaction_id: reactionId,
          headers: {
            accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        },
      );
      return;
    }

    const response = await octokit.request(
      'GET /repos/{owner}/{repo}/issues/{issue_number}/reactions',
      {
        owner,
        repo,
        issue_number: pullRequestNumber,
        headers: {
          accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );
    const reactionsToRemove = response.data.filter(
      reaction => reaction.content === 'eyes' && reaction.user?.type === 'Bot',
    );

    for (const reaction of reactionsToRemove) {
      await octokit.request(
        'DELETE /repos/{owner}/{repo}/issues/{issue_number}/reactions/{reaction_id}',
        {
          owner,
          repo,
          issue_number: pullRequestNumber,
          reaction_id: reaction.id,
          headers: {
            accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        },
      );
    }
  }

  private async deleteExistingAiPullRequestReviewComments(
    octokit: Awaited<ReturnType<App['getInstallationOctokit']>>,
    owner: string,
    repo: string,
    pullRequestNumber: number,
  ): Promise<void> {
    let page = 1;
    const aiCommentIds: number[] = [];

    while (true) {
      const response = await octokit.request(
        'GET /repos/{owner}/{repo}/pulls/{pull_number}/comments',
        {
          owner,
          repo,
          pull_number: pullRequestNumber,
          page,
          per_page: 100,
          headers: {
            'X-GitHub-Api-Version': '2022-11-28',
          },
        },
      );

      aiCommentIds.push(
        ...response.data
          .filter(
            comment =>
              typeof comment.body === 'string' &&
              comment.body.includes(AI_REVIEW_COMMENT_MARKER),
          )
          .map(comment => comment.id),
      );

      if (response.data.length < 100) {
        break;
      }

      page += 1;
    }

    for (const commentId of aiCommentIds) {
      await octokit.request(
        'DELETE /repos/{owner}/{repo}/pulls/comments/{comment_id}',
        {
          owner,
          repo,
          comment_id: commentId,
          headers: {
            'X-GitHub-Api-Version': '2022-11-28',
          },
        },
      );
    }
  }

  private async deleteExistingAiPullRequestIssueComments(
    octokit: Awaited<ReturnType<App['getInstallationOctokit']>>,
    owner: string,
    repo: string,
    pullRequestNumber: number,
    marker: string,
  ): Promise<void> {
    let page = 1;
    const aiCommentIds: number[] = [];

    while (true) {
      const response = await octokit.request(
        'GET /repos/{owner}/{repo}/issues/{issue_number}/comments',
        {
          owner,
          repo,
          issue_number: pullRequestNumber,
          page,
          per_page: 100,
          headers: {
            'X-GitHub-Api-Version': '2022-11-28',
          },
        },
      );

      aiCommentIds.push(
        ...response.data
          .filter(
            comment =>
              typeof comment.body === 'string' && comment.body.includes(marker),
          )
          .map(comment => comment.id),
      );

      if (response.data.length < 100) {
        break;
      }

      page += 1;
    }

    for (const commentId of aiCommentIds) {
      await octokit.request(
        'DELETE /repos/{owner}/{repo}/issues/comments/{comment_id}',
        {
          owner,
          repo,
          comment_id: commentId,
          headers: {
            'X-GitHub-Api-Version': '2022-11-28',
          },
        },
      );
    }
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

  private getRepositoryCoordinates(
    repositoryFullName: string,
    purpose: string,
  ): {owner: string; repo: string} | null {
    const [owner, repo] = repositoryFullName.split('/');

    if (!owner || !repo) {
      console.warn(`Unable to resolve repository owner/name for ${purpose}`, {
        repositoryFullName,
      });
      return null;
    }

    return {owner, repo};
  }

  private getPriorityLabels(): Array<{name: string; color: string}> {
    return [
      {
        name: this.issuePriorityService.getPriorityLabelName('Unknown'),
        color: '8b5cf6',
      },
      {
        name: this.issuePriorityService.getPriorityLabelName('Low'),
        color: '22c55e',
      },
      {
        name: this.issuePriorityService.getPriorityLabelName('Medium'),
        color: 'eab308',
      },
      {
        name: this.issuePriorityService.getPriorityLabelName('High'),
        color: 'f97316',
      },
      {
        name: this.issuePriorityService.getPriorityLabelName('Very-High'),
        color: 'ef4444',
      },
    ];
  }

  private getRiskLabels(): Array<{name: string; color: string}> {
    return [
      {
        name: this.issuePriorityService.getRiskLabelName('Unknown'),
        color: '8b5cf6',
      },
      {
        name: this.issuePriorityService.getRiskLabelName('Low'),
        color: '22c55e',
      },
      {
        name: this.issuePriorityService.getRiskLabelName('Medium'),
        color: 'eab308',
      },
      {
        name: this.issuePriorityService.getRiskLabelName('High'),
        color: 'f97316',
      },
      {
        name: this.issuePriorityService.getRiskLabelName('Very-High'),
        color: 'ef4444',
      },
    ];
  }
}

function buildAiReviewCommentBody(body: string): string {
  return `${body.trim()}\n\n${AI_REVIEW_COMMENT_MARKER}`;
}

function buildAiReviewerSuggestionCommentBody(
  reviewerSuggestions: Array<{
    username: string;
    reason: string;
  }>,
): string | null {
  const groupedSuggestions =
    groupReviewerSuggestionsByReason(reviewerSuggestions);

  if (!groupedSuggestions.length) {
    return null;
  }

  return [
    '### Reviewer suggestions',
    '',
    ...groupedSuggestions.flatMap((group, index) => [
      group.usernames.map(username => `@${username}`).join(', '),
      `\`Reason\`: ${group.reason}`,
      ...(index < groupedSuggestions.length - 1 ? ['<hr>', ''] : []),
    ]),
    '',
    AI_REVIEWER_SUGGESTION_COMMENT_MARKER,
  ].join('\n');
}

function groupReviewerSuggestionsByReason(
  reviewerSuggestions: Array<{
    username: string;
    reason: string;
  }>,
): Array<{reason: string; usernames: string[]}> {
  const groupedSuggestions = new Map<
    string,
    {reason: string; usernames: string[]; seenUsernames: Set<string>}
  >();

  for (const suggestion of reviewerSuggestions) {
    const username = suggestion.username.trim();
    const reason = suggestion.reason.trim();

    if (!username || !reason) {
      continue;
    }

    const reasonKey = reason.toLowerCase();
    const existingGroup = groupedSuggestions.get(reasonKey) ?? {
      reason,
      usernames: [],
      seenUsernames: new Set<string>(),
    };
    const usernameKey = username.toLowerCase();

    if (!existingGroup.seenUsernames.has(usernameKey)) {
      existingGroup.seenUsernames.add(usernameKey);
      existingGroup.usernames.push(username);
    }

    groupedSuggestions.set(reasonKey, existingGroup);
  }

  return Array.from(groupedSuggestions.values()).map(group => ({
    reason: group.reason,
    usernames: group.usernames,
  }));
}

function resolvePullRequestReviewCommentLocation(
  file: GithubPullRequestFile | undefined,
  finding: GithubPullRequestReviewCommentInput,
): GithubPullRequestReviewCommentInput | null {
  if (!file?.patch) {
    return null;
  }

  const addedLines = collectAddedLines(file.patch);
  const normalizedRequestedContent = normalizeDiffLineContent(
    finding.lineContent,
  );
  const requestedLine =
    Number.isInteger(finding.line) && (finding.line ?? 0) > 0
      ? finding.line!
      : Number.MAX_SAFE_INTEGER;

  if (!normalizedRequestedContent) {
    return null;
  }

  const bestMatchingLine = selectClosestMatchingAddedLine(
    addedLines,
    normalizedRequestedContent,
    requestedLine,
  );

  if (bestMatchingLine) {
    return {
      ...finding,
      line: bestMatchingLine.lineNumber,
    };
  }

  return null;
}

function collectAddedLines(
  patch: string,
): Array<{lineNumber: number; content: string}> {
  const addedLines: Array<{lineNumber: number; content: string}> = [];
  let nextNewLineNumber = 0;

  for (const line of patch.split('\n')) {
    const hunkHeaderMatch = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);

    if (hunkHeaderMatch) {
      nextNewLineNumber = Number(hunkHeaderMatch[1]);
      continue;
    }

    if (!nextNewLineNumber) {
      continue;
    }

    if (line.startsWith('+') && !line.startsWith('+++')) {
      addedLines.push({
        lineNumber: nextNewLineNumber,
        content: line.slice(1),
      });
      nextNewLineNumber += 1;
      continue;
    }

    if (line.startsWith('-') && !line.startsWith('---')) {
      continue;
    }

    if (line.startsWith(' ')) {
      nextNewLineNumber += 1;
    }
  }

  return addedLines;
}

function selectClosestMatchingAddedLine(
  addedLines: Array<{lineNumber: number; content: string}>,
  normalizedRequestedContent: string,
  requestedLine: number,
): {lineNumber: number; content: string} | null {
  const matches = addedLines.filter(line =>
    doesDiffLineContentMatch(
      normalizeDiffLineContent(line.content),
      normalizedRequestedContent,
    ),
  );

  if (!matches.length) {
    return null;
  }

  return matches.reduce(
    (closest, candidate) => {
      if (!closest) {
        return candidate;
      }

      return Math.abs(candidate.lineNumber - requestedLine) <
        Math.abs(closest.lineNumber - requestedLine)
        ? candidate
        : closest;
    },
    null as {lineNumber: number; content: string} | null,
  );
}

function doesDiffLineContentMatch(
  candidateContent: string,
  requestedContent: string,
): boolean {
  return (
    candidateContent === requestedContent ||
    candidateContent.includes(requestedContent) ||
    requestedContent.includes(candidateContent)
  );
}

function normalizeDiffLineContent(value: string | undefined): string {
  return value?.replace(/\s+/g, ' ').trim().toLowerCase() ?? '';
}
