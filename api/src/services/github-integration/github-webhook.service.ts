import {BindingScope, injectable, service} from '@loopback/core';
import {repository} from '@loopback/repository';
import {GithubRepositoryRepository, UserRepository} from '../../repositories';
import {GithubService} from './github.service';
import {IssueService} from './issue.service';
import {PullRequestService} from './pull-request.service';
import {IssuePriorityService} from '../issue-priority.service';
import {QueueService} from '../queue.service';

export type GithubWebhookPayload = {
  action?: string;
  sender?: {
    login?: string;
    type?: string;
  };
  installation?: {
    id: number;
  };
  repository?: {
    id?: number;
    owner: {
      login: string;
    };
    name: string;
    full_name?: string;
  };
  pull_request?: {
    id: number;
    number: number;
    title: string;
    body: string | null;
    state: string;
    merged_at?: string | null;
    user?: {
      id: number;
    } | null;
  };
  issue?: {
    id: number;
    node_id: string;
    number: number;
    title: string;
    body: string | null;
    state: string;
  };
};

@injectable({scope: BindingScope.SINGLETON})
export class GithubWebhookService {
  constructor(
    @service(GithubService) private githubService: GithubService,
    @service(IssuePriorityService)
    private issuePriorityService: IssuePriorityService,
    @service(QueueService) private queueService: QueueService,
    @service(IssueService) private issueService: IssueService,
    @service(PullRequestService) private pullRequestService: PullRequestService,
    @repository(GithubRepositoryRepository)
    private githubRepositoryRepository: GithubRepositoryRepository,
    @repository(UserRepository)
    private userRepository: UserRepository,
  ) {}

  async handleWebhook(event: string, payload: GithubWebhookPayload) {
    switch (event) {
      case 'pull_request':
        await this.handlePullRequestEvent(payload);
        break;
      case 'issues':
        await this.handleIssueEvent(payload);
        break;
      case 'installation':
        await this.handleInstallationEvent(payload);
        break;
      case 'installation_repositories':
        await this.handleInstallationRepositoriesEvent(payload);
        break;

      default:
        console.log(`Unhandled event: ${event}`);
    }
  }

  private async handleIssueEvent(payload: GithubWebhookPayload) {
    if (this.isAppAuthoredIssueEvent(payload)) {
      return;
    }

    switch (payload.action) {
      case 'opened':
      case 'edited':
      case 'reopened':
      case 'closed':
        await this.upsertIssue(payload);
        break;
      case 'deleted':
        await this.deleteIssue(payload);
        break;
      default:
        console.log(`Unhandled issue action: ${payload.action}`);
    }
  }

  private async handlePullRequestEvent(payload: GithubWebhookPayload) {
    if (this.isAppAuthoredPullRequestEvent(payload)) {
      return;
    }

    switch (payload.action) {
      case 'opened':
      case 'edited':
      case 'reopened':
      case 'closed':
      case 'ready_for_review':
      case 'converted_to_draft':
      case 'synchronize':
        await this.upsertPullRequest(payload);

        if (
          payload.installation?.id &&
          payload.pull_request &&
          payload.action !== 'closed'
        ) {
          const repository = await this.resolveRepository(payload);

          if (repository) {
            await this.queueService.enqueueGithubPullRequestPrioritization({
              installationId: payload.installation.id,
              repositoryId: repository.id,
              repositoryFullName: repository.fullName,
              githubId: payload.pull_request.id,
              pullRequestNumber: payload.pull_request.number,
              title: payload.pull_request.title,
              description: payload.pull_request.body ?? '',
              status: payload.pull_request.merged_at
                ? 'merged'
                : payload.pull_request.state,
              authorGithubId: payload.pull_request.user?.id ?? null,
            });
          }
        }
        break;
      default:
        console.log(`Unhandled pull_request action: ${payload.action}`);
    }
  }

  private async handleInstallationEvent(payload: GithubWebhookPayload) {
    const installationId = payload.installation?.id;

    if (!installationId) {
      console.warn('GitHub installation webhook missing installation id', {
        action: payload.action,
      });
      return;
    }

    switch (payload.action) {
      case 'created':
      case 'new_permissions_accepted':
      case 'unsuspend':
        await this.githubService.syncInstallationForConnectedWorkspace(
          installationId,
        );
        break;
      case 'deleted':
        await this.githubService.disconnectInstallation(installationId);
        break;
      default:
        console.log(`Unhandled installation action: ${payload.action}`);
    }
  }

  private async handleInstallationRepositoriesEvent(
    payload: GithubWebhookPayload,
  ) {
    const installationId = payload.installation?.id;

    if (!installationId) {
      console.warn(
        'GitHub installation_repositories webhook missing installation id',
        {
          action: payload.action,
        },
      );
      return;
    }

    switch (payload.action) {
      case 'added':
      case 'removed':
        await this.githubService.syncInstallationForConnectedWorkspace(
          installationId,
        );
        break;
      default:
        console.log(
          `Unhandled installation_repositories action: ${payload.action}`,
        );
    }
  }

  private async upsertIssue(payload: GithubWebhookPayload): Promise<void> {
    const repository = await this.resolveRepository(payload);

    if (!repository || !payload.issue) {
      return;
    }

    const cleanedDescription =
      this.issuePriorityService.sanitizeIssueDescription(
        payload.issue.body ?? '',
      );
    let processingReactionId: number | null = null;

    if (payload.installation?.id) {
      processingReactionId = await this.githubService.markIssueAsProcessing(
        payload.installation.id,
        repository.fullName,
        payload.issue.number,
      );
    }

    const prediction = await this.issuePriorityService.predictIssuePriority({
      title: payload.issue.title,
      description: cleanedDescription,
    });

    await this.issueService.upsertIssue(
      {
        repositoryId: repository.id,
        githubId: payload.issue.id,
        githubIssueNumber: payload.issue.number,
        title: payload.issue.title,
        status: payload.issue.state,
        description: cleanedDescription,
        priority: prediction.priority,
        priorityReason: prediction.reason,
      },
      {
        repositoryId: repository.id,
        githubId: payload.issue.id,
      },
    );

    if (!payload.installation?.id) {
      console.warn(
        'GitHub issues webhook payload missing installation id for priority sync',
        {
          action: payload.action,
          issueNumber: payload.issue.number,
          repositoryFullName: repository.fullName,
        },
      );
      return;
    }

    await this.githubService.syncRepositoryLabels(
      payload.installation.id,
      repository.fullName,
    );
    await this.githubService.applyPriorityPredictionToIssue(
      payload.installation.id,
      repository.fullName,
      payload.issue.number,
      prediction,
      cleanedDescription,
      processingReactionId,
    );
  }

  private isAppAuthoredIssueEvent(payload: GithubWebhookPayload): boolean {
    const action = payload.action;

    if (action !== 'opened' && action !== 'edited' && action !== 'reopened') {
      return false;
    }

    return payload.sender?.type === 'Bot';
  }

  private isAppAuthoredPullRequestEvent(
    payload: GithubWebhookPayload,
  ): boolean {
    const action = payload.action;

    if (
      action !== 'opened' &&
      action !== 'edited' &&
      action !== 'reopened' &&
      action !== 'ready_for_review' &&
      action !== 'converted_to_draft' &&
      action !== 'synchronize'
    ) {
      return false;
    }

    return payload.sender?.type === 'Bot';
  }

  private async deleteIssue(payload: GithubWebhookPayload): Promise<void> {
    const repository = await this.resolveRepository(payload);

    if (!repository || !payload.issue) {
      return;
    }

    await this.issueService.deleteOne({
      repositoryId: repository.id,
      githubId: payload.issue.id,
    });
  }

  private async upsertPullRequest(
    payload: GithubWebhookPayload,
  ): Promise<void> {
    const repository = await this.resolveRepository(payload);

    if (!repository || !payload.pull_request) {
      return;
    }

    const author = payload.pull_request.user
      ? await this.userRepository.findOne({
          where: {githubId: payload.pull_request.user.id},
        })
      : null;

    await this.pullRequestService.upsertPullRequest(
      {
        repositoryId: repository.id,
        githubPrNumber: payload.pull_request.number,
        title: payload.pull_request.title,
        status: payload.pull_request.merged_at
          ? 'merged'
          : payload.pull_request.state,
        description: payload.pull_request.body ?? '',
        authorId: author?.id ?? null,
      },
      {
        repositoryId: repository.id,
        githubPrNumber: payload.pull_request.number,
      },
    );
  }

  private async resolveRepository(payload: GithubWebhookPayload) {
    const fullName =
      payload.repository?.full_name ??
      (payload.repository
        ? `${payload.repository.owner.login}/${payload.repository.name}`
        : undefined);

    if (!fullName) {
      console.warn('GitHub webhook payload missing repository full name', {
        action: payload.action,
      });
      return null;
    }

    const repository = await this.githubRepositoryRepository.findOne({
      where: {fullName},
    });

    if (!repository) {
      console.warn('No synced GitHub repository found for webhook payload', {
        fullName,
        action: payload.action,
      });
      return null;
    }

    return repository;
  }
}
