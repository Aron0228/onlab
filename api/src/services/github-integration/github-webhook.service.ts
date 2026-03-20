/* eslint-disable no-constant-condition */
import {BindingScope, injectable, service} from '@loopback/core';
import {App} from 'octokit';
import {GithubService} from './github.service';

export type GithubWebhookPayload = {
  action?: string;
  installation?: {
    id: number;
  };
  repository?: {
    owner: {
      login: string;
    };
    name: string;
  };
  pull_request?: {
    number: number;
  };
  issue?: {
    node_id: string;
    number: number;
  };
};

@injectable({scope: BindingScope.SINGLETON})
export class GithubWebhookService {
  private app: App;

  constructor(@service(GithubService) private githubService: GithubService) {
    this.app = new App({
      appId: process.env.GITHUB_APP_ID!,
      privateKey: process.env.GITHUB_PRIVATE_KEY!,
      webhooks: {
        secret: process.env.GITHUB_WEBHOOK_SECRET!,
      },
    });
  }

  async getInstallationClient(
    installationId: number,
  ): ReturnType<App['getInstallationOctokit']> {
    return this.app.getInstallationOctokit(installationId);
  }

  async handleWebhook(event: string, payload: GithubWebhookPayload) {
    switch (event) {
      case 'pull_request':
        if (payload.action === 'opened') {
          await this.handlePullRequestOpened(payload);
        }
        break;
      case 'issues':
        if (payload.action === 'opened') {
          await this.handleIssueOpened(payload);
        }
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

  private async handlePullRequestOpened(payload: GithubWebhookPayload) {
    const installationId = payload.installation?.id;

    if (
      !installationId ||
      !payload.repository?.owner.login ||
      !payload.repository.name ||
      !payload.pull_request?.number
    ) {
      console.warn(
        'GitHub pull_request webhook payload is incomplete',
        payload,
      );
      return;
    }

    const octokit = await this.getInstallationClient(installationId);

    await octokit.request(
      'POST /repos/{owner}/{repo}/issues/{issue_number}/comments',
      {
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number: payload.pull_request.number,
        body: '🚀 Thanks for the PR!',
      },
    );

    console.log(`Commented on PR #${payload.pull_request.number}`);
  }

  private async handleIssueOpened(payload: GithubWebhookPayload) {
    const installationId = payload.installation?.id;

    if (
      !installationId ||
      !payload.issue?.node_id ||
      !payload.issue.number ||
      !payload.repository?.owner.login ||
      !payload.repository.name
    ) {
      console.warn('GitHub issues webhook payload is incomplete', payload);
      return;
    }

    const octokit = await this.getInstallationClient(installationId);

    // await octokit.graphql(
    //   `
    //     mutation AddLabelToIssue($labelableId: ID!, $labelIds: [ID!]!) {
    //       addLabelsToLabelable(
    //         input: {labelableId: $labelableId, labelIds: $labelIds}
    //       ) {
    //         clientMutationId
    //       }
    //     }
    //   `,
    //   {
    //     labelableId: payload.issue.node_id,
    //     labelIds: [this.issueOpenedLabelId],
    //   },
    // );

    await octokit.request(
      'POST /repos/{owner}/{repo}/issues/{issue_number}/comments',
      {
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number: payload.issue.number,
        body: '🚀 Thanks for opening this issue!',
      },
    );

    console.log(`Labeled and commented on issue #${payload.issue.number}`);
  }
}
