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
    findOne: ReturnType<typeof vi.fn>;
  };
  let pullRequestReviewerService: {
    syncRequestedReviewers: ReturnType<typeof vi.fn>;
    markProgress: ReturnType<typeof vi.fn>;
  };
  let capacityPlanningSyncService: {
    syncGithubIssueAssigneeChange: ReturnType<typeof vi.fn>;
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
        estimatedHours: 8,
        estimationConfidence: 'medium',
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
      findOne: vi.fn().mockResolvedValue({id: 101}),
    };
    pullRequestReviewerService = {
      syncRequestedReviewers: vi.fn().mockResolvedValue(undefined),
      markProgress: vi.fn().mockResolvedValue(undefined),
    };
    capacityPlanningSyncService = {
      syncGithubIssueAssigneeChange: vi.fn().mockResolvedValue(undefined),
    };
    githubRepositoryRepository = {
      findOne: vi.fn().mockResolvedValue({
        id: 99,
        fullName: 'team/api',
        workspaceId: 4,
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
      pullRequestReviewerService as never,
      capacityPlanningSyncService as never,
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

  it('ignores installation webhooks that do not include an installation id', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await service.handleWebhook('installation', {
      action: 'created',
    });
    await service.handleWebhook('installation_repositories', {
      action: 'added',
    });

    expect(
      githubService.syncInstallationForConnectedWorkspace,
    ).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(2);

    warnSpy.mockRestore();
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
      },
      {
        repositoryId: 99,
        githubId: 11,
      },
      {
        priority: 'High',
        reason: 'The module is unusable.',
        estimatedHours: 8,
        estimationConfidence: 'medium',
        expertiseRecommendations: undefined,
      },
    );
    expect(issuePriorityService.predictIssuePriority).toHaveBeenCalledWith({
      installationId: 123,
      repositoryFullName: 'team/api',
      workspaceId: 4,
      title: 'Broken',
      description: 'Updated body',
    });
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
        estimatedHours: 8,
        estimationConfidence: 'medium',
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

  it('still processes issue events authored by third-party bots', async () => {
    await service.handleWebhook('issues', {
      action: 'edited',
      sender: {
        login: 'dependabot[bot]',
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

    expect(issueService.upsertIssue).toHaveBeenCalled();
    expect(githubService.markIssueAsProcessing).toHaveBeenCalled();
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

  it('ignores issue metadata events without reprioritizing the issue', async () => {
    await service.handleWebhook('issues', {
      action: 'labeled',
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

    expect(issueService.upsertIssue).not.toHaveBeenCalled();
    expect(issuePriorityService.predictIssuePriority).not.toHaveBeenCalled();
    expect(githubService.applyPriorityPredictionToIssue).not.toHaveBeenCalled();
  });

  it('syncs GitHub issue assignee changes into capacity planning', async () => {
    await service.handleWebhook('issues', {
      action: 'assigned',
      sender: {
        login: 'octocat',
        type: 'User',
      },
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
      assignee: {id: 111, login: 'octocat'},
    });

    expect(
      capacityPlanningSyncService.syncGithubIssueAssigneeChange,
    ).toHaveBeenCalledWith({
      action: 'assigned',
      repositoryId: 99,
      githubIssueId: 11,
      githubIssueNumber: 101,
      assignee: {id: 111, login: 'octocat'},
    });
    expect(issuePriorityService.predictIssuePriority).not.toHaveBeenCalled();
    expect(issueService.upsertIssue).not.toHaveBeenCalled();
  });

  it('syncs GitHub issue unassignments into capacity planning', async () => {
    await service.handleWebhook('issues', {
      action: 'unassigned',
      sender: {
        login: 'octocat',
        type: 'User',
      },
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
      assignee: {id: 111, login: 'octocat'},
    });

    expect(
      capacityPlanningSyncService.syncGithubIssueAssigneeChange,
    ).toHaveBeenCalledWith({
      action: 'unassigned',
      repositoryId: 99,
      githubIssueId: 11,
      githubIssueNumber: 101,
      assignee: {id: 111, login: 'octocat'},
    });
    expect(issuePriorityService.predictIssuePriority).not.toHaveBeenCalled();
    expect(issueService.upsertIssue).not.toHaveBeenCalled();
  });

  it('ignores issue assignee changes when repository identity is missing', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await service.handleWebhook('issues', {
      action: 'assigned',
      sender: {
        login: 'octocat',
        type: 'User',
      },
      issue: {
        id: 11,
        node_id: 'node-1',
        number: 101,
        title: 'Broken',
        body: 'Updated body',
        state: 'open',
      },
      assignee: {id: 111, login: 'octocat'},
    });

    expect(warnSpy).toHaveBeenCalledWith(
      'GitHub webhook payload missing repository full name',
      {action: 'assigned'},
    );
    expect(
      capacityPlanningSyncService.syncGithubIssueAssigneeChange,
    ).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('ignores issue assignee changes when the repository is not synced', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    githubRepositoryRepository.findOne.mockResolvedValueOnce(null);

    await service.handleWebhook('issues', {
      action: 'assigned',
      sender: {
        login: 'octocat',
        type: 'User',
      },
      repository: {
        owner: {login: 'team'},
        name: 'unknown',
        full_name: 'team/unknown',
      },
      issue: {
        id: 11,
        node_id: 'node-1',
        number: 101,
        title: 'Broken',
        body: 'Updated body',
        state: 'open',
      },
      assignee: {id: 111, login: 'octocat'},
    });

    expect(warnSpy).toHaveBeenCalledWith(
      'No synced GitHub repository found for webhook payload',
      {
        fullName: 'team/unknown',
        action: 'assigned',
      },
    );
    expect(
      capacityPlanningSyncService.syncGithubIssueAssigneeChange,
    ).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('ignores GitHub issue assignee changes authored by the app bot', async () => {
    await service.handleWebhook('issues', {
      action: 'unassigned',
      sender: {
        login: 'devteams-demo[bot]',
        type: 'Bot',
      },
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
      assignee: {id: 111, login: 'octocat'},
    });

    expect(
      capacityPlanningSyncService.syncGithubIssueAssigneeChange,
    ).not.toHaveBeenCalled();
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
    expect(
      pullRequestReviewerService.syncRequestedReviewers,
    ).toHaveBeenCalledWith({
      pullRequest: {id: 101},
      reviewers: [],
    });
  });

  it('syncs requested reviewers for pull request review request events', async () => {
    await service.handleWebhook('pull_request', {
      action: 'review_requested',
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
        requested_reviewers: [
          {id: 101, login: 'octocat'},
          {id: 102, login: 'hubot'},
        ],
      },
    });

    expect(
      pullRequestReviewerService.syncRequestedReviewers,
    ).toHaveBeenCalledWith({
      pullRequest: {id: 101},
      reviewers: [
        {id: 101, login: 'octocat'},
        {id: 102, login: 'hubot'},
      ],
    });
    expect(
      queueService.enqueueGithubPullRequestPrioritization,
    ).not.toHaveBeenCalled();
  });

  it('skips reviewer sync when the local pull request is not found', async () => {
    pullRequestService.findOne.mockResolvedValueOnce(null);

    await service.handleWebhook('pull_request', {
      action: 'review_request_removed',
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
        requested_reviewers: [{id: 101, login: 'octocat'}],
      },
    });

    expect(
      pullRequestReviewerService.syncRequestedReviewers,
    ).not.toHaveBeenCalled();
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

  it('still stores pull request edits authored by third-party bots without queueing AI review', async () => {
    await service.handleWebhook('pull_request', {
      action: 'edited',
      sender: {
        login: 'dependabot[bot]',
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

    expect(pullRequestService.upsertPullRequest).toHaveBeenCalled();
    expect(
      queueService.enqueueGithubPullRequestPrioritization,
    ).not.toHaveBeenCalled();
  });

  it('stores edited pull requests without queueing AI review', async () => {
    await service.handleWebhook('pull_request', {
      action: 'edited',
      installation: {id: 123},
      repository: {
        owner: {login: 'team'},
        name: 'api',
        full_name: 'team/api',
      },
      pull_request: {
        id: 19,
        number: 204,
        title: 'Tighten auth guard',
        body: 'Updated body text',
        state: 'open',
        user: {id: 55},
      },
    });

    expect(pullRequestService.upsertPullRequest).toHaveBeenCalledWith(
      {
        repositoryId: 99,
        githubPrNumber: 204,
        title: 'Tighten auth guard',
        status: 'open',
        description: 'Updated body text',
        authorId: 7,
      },
      {
        repositoryId: 99,
        githubPrNumber: 204,
      },
    );
    expect(
      queueService.enqueueGithubPullRequestPrioritization,
    ).not.toHaveBeenCalled();
  });

  it('stores ready-for-review pull requests without queueing AI review', async () => {
    await service.handleWebhook('pull_request', {
      action: 'ready_for_review',
      installation: {id: 123},
      repository: {
        owner: {login: 'team'},
        name: 'api',
        full_name: 'team/api',
      },
      pull_request: {
        id: 20,
        number: 205,
        title: 'Finish draft',
        body: 'Ready now',
        state: 'open',
        user: {id: 55},
      },
    });

    expect(pullRequestService.upsertPullRequest).toHaveBeenCalled();
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

  it('marks reviewer progress from pull request review events', async () => {
    await service.handleWebhook('pull_request_review', {
      action: 'submitted',
      repository: {
        owner: {login: 'team'},
        name: 'api',
        full_name: 'team/api',
      },
      pull_request: {
        id: 18,
        number: 203,
        title: 'Review me',
        body: 'Body',
        state: 'open',
      },
      review: {
        state: 'APPROVED',
        user: {id: 55, login: 'reviewer'},
      },
    });

    expect(pullRequestReviewerService.markProgress).toHaveBeenCalledWith({
      repositoryId: 99,
      pullRequestNumber: 203,
      reviewer: {id: 55, login: 'reviewer'},
      status: 'approved',
    });
  });

  it('ignores unsupported pull request review states', async () => {
    await service.handleWebhook('pull_request_review', {
      action: 'submitted',
      repository: {
        owner: {login: 'team'},
        name: 'api',
        full_name: 'team/api',
      },
      pull_request: {
        id: 18,
        number: 203,
        title: 'Review me',
        body: 'Body',
        state: 'open',
      },
      review: {
        state: 'pending',
        user: {id: 55, login: 'reviewer'},
      },
    });

    expect(pullRequestReviewerService.markProgress).not.toHaveBeenCalled();
  });

  it('marks reviewer progress from review comments and PR issue comments', async () => {
    await service.handleWebhook('pull_request_review_comment', {
      action: 'created',
      repository: {
        owner: {login: 'team'},
        name: 'api',
        full_name: 'team/api',
      },
      pull_request: {
        id: 18,
        number: 203,
        title: 'Review me',
        body: 'Body',
        state: 'open',
      },
      comment: {
        user: {id: 55, login: 'reviewer'},
      },
    });

    await service.handleWebhook('issue_comment', {
      action: 'created',
      sender: {
        login: 'octocat',
        type: 'User',
      },
      repository: {
        owner: {login: 'team'},
        name: 'api',
        full_name: 'team/api',
      },
      issue: {
        id: 18,
        node_id: 'node-18',
        number: 203,
        title: 'Review me',
        body: 'Body',
        state: 'open',
        pull_request: {},
      },
      comment: {
        user: {id: 56, login: 'commenter'},
      },
    });

    expect(pullRequestReviewerService.markProgress).toHaveBeenCalledWith({
      repositoryId: 99,
      pullRequestNumber: 203,
      reviewer: {id: 55, login: 'reviewer'},
      status: 'commented',
    });
    expect(pullRequestReviewerService.markProgress).toHaveBeenCalledWith({
      repositoryId: 99,
      pullRequestNumber: 203,
      reviewer: {id: 56, login: 'commenter'},
      status: 'commented',
    });
  });

  it('ignores issue comments outside pull requests and comments authored by the app bot', async () => {
    await service.handleWebhook('issue_comment', {
      action: 'created',
      repository: {
        owner: {login: 'team'},
        name: 'api',
        full_name: 'team/api',
      },
      issue: {
        id: 18,
        node_id: 'node-18',
        number: 203,
        title: 'Issue',
        body: 'Body',
        state: 'open',
      },
      comment: {
        user: {id: 56, login: 'commenter'},
      },
    });

    await service.handleWebhook('issue_comment', {
      action: 'created',
      sender: {
        login: 'devteams-demo[bot]',
        type: 'Bot',
      },
      repository: {
        owner: {login: 'team'},
        name: 'api',
        full_name: 'team/api',
      },
      issue: {
        id: 18,
        node_id: 'node-18',
        number: 203,
        title: 'PR',
        body: 'Body',
        state: 'open',
        pull_request: {},
      },
      comment: {
        user: {id: 56, login: 'commenter'},
      },
    });

    expect(pullRequestReviewerService.markProgress).not.toHaveBeenCalled();
  });
});
