import {beforeEach, describe, expect, it, vi} from 'vitest';

import {GithubWebhookService} from '../../../services/github-integration/github-webhook.service';

describe('GithubWebhookService (unit)', () => {
  let githubService: {
    syncInstallationForConnectedWorkspace: ReturnType<typeof vi.fn>;
    disconnectInstallation: ReturnType<typeof vi.fn>;
    syncRepositoryLabels: ReturnType<typeof vi.fn>;
    applyPriorityPredictionToIssue: ReturnType<typeof vi.fn>;
    markIssueAsProcessing: ReturnType<typeof vi.fn>;
  };
  let issuePriorityService: {
    sanitizeIssueDescription: ReturnType<typeof vi.fn>;
    predictIssuePriority: ReturnType<typeof vi.fn>;
  };
  let queueService: {
    enqueueGithubPullRequestPrioritization: ReturnType<typeof vi.fn>;
  };
  let issueService: {
    upsertIssue: ReturnType<typeof vi.fn>;
    deleteOne: ReturnType<typeof vi.fn>;
  };
  let pullRequestService: {
    upsertPullRequest: ReturnType<typeof vi.fn>;
  };
  let githubRepositoryRepository: {
    findOne: ReturnType<typeof vi.fn>;
  };
  let userRepository: {
    findOne: ReturnType<typeof vi.fn>;
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
      syncRepositoryLabels: vi.fn().mockResolvedValue(undefined),
      applyPriorityPredictionToIssue: vi.fn().mockResolvedValue(undefined),
      markIssueAsProcessing: vi.fn().mockResolvedValue(undefined),
    };
    issuePriorityService = {
      sanitizeIssueDescription: vi
        .fn()
        .mockImplementation((description: string) => description),
      predictIssuePriority: vi.fn().mockResolvedValue({
        priority: 'High',
        reason: 'The module is unusable.',
      }),
    };
    queueService = {
      enqueueGithubPullRequestPrioritization: vi
        .fn()
        .mockResolvedValue(undefined),
    };
    issueService = {
      upsertIssue: vi.fn().mockResolvedValue(undefined),
      deleteOne: vi.fn().mockResolvedValue(undefined),
    };
    pullRequestService = {
      upsertPullRequest: vi.fn().mockResolvedValue(undefined),
    };
    githubRepositoryRepository = {
      findOne: vi.fn().mockResolvedValue({
        id: 99,
        fullName: 'team/api',
      }),
    };
    userRepository = {
      findOne: vi.fn().mockResolvedValue({id: 7}),
    };

    service = new GithubWebhookService(
      githubService as never,
      issuePriorityService as never,
      queueService as never,
      issueService as never,
      pullRequestService as never,
      githubRepositoryRepository as never,
      userRepository as never,
    );
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

  it('upserts issues on issue edits', async () => {
    await service.handleWebhook('issues', {
      action: 'edited',
      sender: {
        login: 'octocat',
        type: 'User',
      },
      installation: {id: 123},
      repository: {
        owner: {login: 'team'},
        name: 'api',
        full_name: 'team/api',
      },
      issue: {
        id: 11,
        node_id: 'node-1',
        number: 101,
        title: 'Broken',
        body: 'Updated body',
        state: 'open',
      },
    });

    expect(issueService.upsertIssue).toHaveBeenCalledWith(
      {
        repositoryId: 99,
        githubId: 11,
        githubIssueNumber: 101,
        title: 'Broken',
        status: 'open',
        description: 'Updated body',
        priority: 'High',
        priorityReason: 'The module is unusable.',
      },
      {
        repositoryId: 99,
        githubId: 11,
      },
    );
    expect(githubService.syncRepositoryLabels).toHaveBeenCalledWith(
      123,
      'team/api',
    );
    expect(githubService.markIssueAsProcessing).toHaveBeenCalledWith(
      123,
      'team/api',
      101,
    );
    expect(githubService.applyPriorityPredictionToIssue).toHaveBeenCalledWith(
      123,
      'team/api',
      101,
      {
        priority: 'High',
        reason: 'The module is unusable.',
      },
      'Updated body',
      undefined,
    );
  });

  it('ignores issue events authored by the GitHub app bot', async () => {
    await service.handleWebhook('issues', {
      action: 'edited',
      sender: {
        login: 'devteams-demo[bot]',
        type: 'Bot',
      },
      installation: {id: 123},
      repository: {
        owner: {login: 'team'},
        name: 'api',
        full_name: 'team/api',
      },
      issue: {
        id: 11,
        node_id: 'node-1',
        number: 101,
        title: 'Broken',
        body: 'Updated body',
        state: 'open',
      },
    });

    expect(githubService.markIssueAsProcessing).not.toHaveBeenCalled();
    expect(githubService.applyPriorityPredictionToIssue).not.toHaveBeenCalled();
    expect(issueService.upsertIssue).not.toHaveBeenCalled();
  });

  it('deletes issues on issue deletion events', async () => {
    await service.handleWebhook('issues', {
      action: 'deleted',
      repository: {
        owner: {login: 'team'},
        name: 'api',
        full_name: 'team/api',
      },
      issue: {
        id: 11,
        node_id: 'node-1',
        number: 101,
        title: 'Broken',
        body: null,
        state: 'closed',
      },
    });

    expect(issueService.deleteOne).toHaveBeenCalledWith({
      repositoryId: 99,
      githubId: 11,
    });
  });

  it('upserts pull requests on pull request updates', async () => {
    await service.handleWebhook('pull_request', {
      action: 'synchronize',
      installation: {id: 123},
      repository: {
        owner: {login: 'team'},
        name: 'api',
        full_name: 'team/api',
      },
      pull_request: {
        id: 17,
        number: 202,
        title: 'Ship it',
        body: 'Merged body',
        state: 'open',
        user: {id: 55},
      },
    });

    expect(userRepository.findOne).toHaveBeenCalledWith({
      where: {githubId: 55},
    });
    expect(pullRequestService.upsertPullRequest).toHaveBeenCalledWith(
      {
        repositoryId: 99,
        githubPrNumber: 202,
        title: 'Ship it',
        status: 'open',
        description: 'Merged body',
        authorId: 7,
      },
      {
        repositoryId: 99,
        githubPrNumber: 202,
      },
    );
    expect(
      queueService.enqueueGithubPullRequestPrioritization,
    ).toHaveBeenCalledWith({
      installationId: 123,
      repositoryId: 99,
      repositoryFullName: 'team/api',
      githubId: 17,
      pullRequestNumber: 202,
      title: 'Ship it',
      description: 'Merged body',
      status: 'open',
      authorGithubId: 55,
    });
  });

  it('ignores pull request events authored by the GitHub app bot', async () => {
    await service.handleWebhook('pull_request', {
      action: 'edited',
      sender: {
        login: 'devteams-demo[bot]',
        type: 'Bot',
      },
      installation: {id: 123},
      repository: {
        owner: {login: 'team'},
        name: 'api',
        full_name: 'team/api',
      },
      pull_request: {
        id: 17,
        number: 202,
        title: 'Ship it',
        body: 'Merged body',
        state: 'open',
        user: {id: 55},
      },
    });

    expect(pullRequestService.upsertPullRequest).not.toHaveBeenCalled();
    expect(
      queueService.enqueueGithubPullRequestPrioritization,
    ).not.toHaveBeenCalled();
  });

  it('stores closed pull requests without queueing AI prioritization', async () => {
    await service.handleWebhook('pull_request', {
      action: 'closed',
      installation: {id: 123},
      repository: {
        owner: {login: 'team'},
        name: 'api',
        full_name: 'team/api',
      },
      pull_request: {
        id: 18,
        number: 203,
        title: 'Already merged',
        body: 'Final state',
        state: 'closed',
        merged_at: '2026-03-29T12:00:00Z',
        user: {id: 55},
      },
    });

    expect(pullRequestService.upsertPullRequest).toHaveBeenCalledWith(
      {
        repositoryId: 99,
        githubPrNumber: 203,
        title: 'Already merged',
        status: 'merged',
        description: 'Final state',
        authorId: 7,
      },
      {
        repositoryId: 99,
        githubPrNumber: 203,
      },
    );
    expect(
      queueService.enqueueGithubPullRequestPrioritization,
    ).not.toHaveBeenCalled();
  });
});
