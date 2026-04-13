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
  getGithubAppInfo(): Promise<{
    slug: string;
    name: string;
  }>;
  getInstallation(installationId: number): Promise<{
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
  }>;
  getInstallationClient(installationId: number): Promise<unknown>;
  saveInstallationRepositories(
    workspaceId: number,
    installationId: number,
    repositories: GithubInstallationRepository[],
  ): Promise<void>;
  syncWorkspaceInstallation(
    workspaceId: number,
    installationId: number,
  ): Promise<void>;
  listInstallationRepositories(
    installationId: number,
  ): Promise<GithubInstallationRepository[]>;
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
    enqueueGithubLabelsSync: ReturnType<typeof vi.fn>;
  };
  let issuePriorityService: {
    getPriorityLabelName: ReturnType<typeof vi.fn>;
    getRiskLabelName: ReturnType<typeof vi.fn>;
    upsertPredictionNote: ReturnType<typeof vi.fn>;
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
      enqueueGithubLabelsSync: vi.fn().mockResolvedValue(undefined),
      enqueueGithubIssuesSync: vi.fn().mockResolvedValue(undefined),
    };
    issuePriorityService = {
      getPriorityLabelName: vi
        .fn()
        .mockImplementation(priority => `Priority: ${String(priority)}`),
      getRiskLabelName: vi
        .fn()
        .mockImplementation(priority => `Risk: ${String(priority)}`),
      upsertPredictionNote: vi
        .fn()
        .mockImplementation((description: string) => description),
    };

    service = new GithubService(
      async () => workspaceRepository as never,
      async () => githubRepositoryRepository as never,
      queueService as never,
      issuePriorityService as never,
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
      issueSyncDone: false,
      prSyncDone: false,
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

  it('enqueues label sync alongside issue sync when syncing a workspace installation', async () => {
    githubRepositoryRepository.find.mockResolvedValue([]);
    vi.spyOn(internals, 'listInstallationRepositories').mockResolvedValue([]);

    await internals.syncWorkspaceInstallation(8, 88);

    expect(queueService.enqueueGithubLabelsSync).toHaveBeenCalledWith({
      installationId: 88,
      workspaceId: 8,
    });
    expect(queueService.enqueueGithubIssuesSync).toHaveBeenCalledWith({
      installationId: 88,
      workspaceId: 8,
    });
  });

  it('signs workspace state in the installation URL and accepts it on callback', async () => {
    internals.getGithubAppInfo = vi.fn().mockResolvedValue({
      slug: 'devteams-demo',
      name: 'DevTeams Demo',
    });
    internals.getInstallation = vi.fn().mockResolvedValue({
      id: 77,
      account: null,
      app_id: 1,
      app_slug: 'devteams-demo',
      target_id: 2,
      target_type: 'Organization',
      permissions: {},
      events: [],
    });
    vi.spyOn(internals, 'listInstallationRepositories').mockResolvedValue([]);
    const syncWorkspaceInstallationSpy = vi
      .spyOn(internals, 'syncWorkspaceInstallation')
      .mockResolvedValue(undefined);
    const response = {
      redirect: vi.fn(),
    };

    const installationUrl = await service.getInstallationUrl('42');
    const signedState = new URL(installationUrl).searchParams.get('state');

    expect(signedState).toBeTruthy();
    expect(signedState).not.toBe('42');

    await service.callback(response as never, '77', 'install', signedState!);

    expect(syncWorkspaceInstallationSpy).toHaveBeenCalledWith(42, 77);
    expect(response.redirect).toHaveBeenCalledWith(
      'https://client.example.com/workspaces/callback?workspaceId=42',
    );
  });

  it('does not trust a tampered callback state token', async () => {
    internals.getGithubAppInfo = vi.fn().mockResolvedValue({
      slug: 'devteams-demo',
      name: 'DevTeams Demo',
    });
    internals.getInstallation = vi.fn().mockResolvedValue({
      id: 77,
      account: null,
      app_id: 1,
      app_slug: 'devteams-demo',
      target_id: 2,
      target_type: 'Organization',
      permissions: {},
      events: [],
    });
    vi.spyOn(internals, 'listInstallationRepositories').mockResolvedValue([]);
    const syncWorkspaceInstallationSpy = vi
      .spyOn(internals, 'syncWorkspaceInstallation')
      .mockResolvedValue(undefined);
    const response = {
      redirect: vi.fn(),
    };

    const installationUrl = await service.getInstallationUrl('42');
    const signedState = new URL(installationUrl).searchParams.get('state')!;
    const tamperedState = `${signedState.slice(0, -1)}${
      signedState.endsWith('a') ? 'b' : 'a'
    }`;

    await service.callback(response as never, '77', 'install', tamperedState);

    expect(syncWorkspaceInstallationSpy).not.toHaveBeenCalled();
    expect(response.redirect).toHaveBeenCalledWith(
      'https://client.example.com/workspaces/callback',
    );
  });

  it('lists all pull requests during repository sync', async () => {
    const octokit = {
      request: vi.fn().mockResolvedValue({
        data: [
          {
            id: 17,
            number: 6,
            title: 'Open PR',
            state: 'open',
            merged_at: null,
            body: 'Still active',
            draft: false,
            user: {id: 55},
          },
        ],
      }),
    };
    vi.spyOn(internals, 'getInstallationClient').mockResolvedValue(
      octokit as never,
    );

    await expect(
      service.listRepositoryPullRequestsPage(4, 'team/api', 2, 25),
    ).resolves.toEqual([
      {
        id: 17,
        number: 6,
        title: 'Open PR',
        state: 'open',
        merged_at: null,
        body: 'Still active',
        draft: false,
        user: {id: 55},
      },
    ]);

    expect(octokit.request).toHaveBeenCalledWith(
      'GET /repos/{owner}/{repo}/pulls',
      expect.objectContaining({
        owner: 'team',
        repo: 'api',
        page: 2,
        per_page: 25,
        state: 'all',
      }),
    );
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
      issueSyncDone: false,
      prSyncDone: false,
    });
  });

  it('replaces prior AI review comments and posts only findings anchored to changed lines', async () => {
    const octokit = {
      request: vi.fn(),
    };
    vi.spyOn(internals, 'getInstallationClient').mockResolvedValue(
      octokit as never,
    );
    vi.spyOn(service, 'getPullRequestOverview').mockResolvedValue({
      number: 17,
      title: 'Tighten auth',
      body: null,
      state: 'open',
      draft: false,
      mergeable_state: 'clean',
      additions: 3,
      deletions: 1,
      changed_files: 1,
      commits: 1,
      base_ref: 'main',
      head_ref: 'feature/auth',
      head_sha: 'abc123',
      requested_reviewer_logins: [],
    });
    vi.spyOn(service, 'listPullRequestFiles').mockResolvedValue([
      {
        filename: 'src/auth/guard.ts',
        status: 'modified',
        additions: 3,
        deletions: 1,
        changes: 4,
        patch:
          '@@ -10,2 +10,3 @@\n old\n-oldCheck()\n+allowAll()\n+return true\n tail',
      },
    ]);
    octokit.request
      .mockResolvedValueOnce({
        data: [
          {
            id: 1,
            body: 'Existing note\n\n<!-- onlab-ai-review-comment -->',
          },
          {
            id: 2,
            body: 'Human review comment',
          },
        ],
      })
      .mockResolvedValueOnce({data: {}})
      .mockResolvedValueOnce({data: {}});

    await service.syncPullRequestReviewComments(4, 'team/api', 17, [
      {
        path: 'src/auth/guard.ts',
        line: 11,
        body: 'This bypasses the guard and grants access to every request.',
        lineContent: 'return true',
      },
      {
        path: 'src/auth/guard.ts',
        line: 99,
        body: 'Invalid line should be dropped.',
      },
    ]);

    expect(octokit.request).toHaveBeenNthCalledWith(
      1,
      'GET /repos/{owner}/{repo}/pulls/{pull_number}/comments',
      expect.objectContaining({
        owner: 'team',
        repo: 'api',
        pull_number: 17,
      }),
    );
    expect(octokit.request).toHaveBeenNthCalledWith(
      2,
      'DELETE /repos/{owner}/{repo}/pulls/comments/{comment_id}',
      expect.objectContaining({
        owner: 'team',
        repo: 'api',
        comment_id: 1,
      }),
    );
    expect(octokit.request).toHaveBeenNthCalledWith(
      3,
      'POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews',
      expect.objectContaining({
        owner: 'team',
        repo: 'api',
        pull_number: 17,
        commit_id: 'abc123',
        event: 'COMMENT',
        body: 'DevTeams AI review findings.',
        comments: [
          {
            path: 'src/auth/guard.ts',
            line: 12,
            side: 'RIGHT',
            body: 'This bypasses the guard and grants access to every request.\n\n<!-- onlab-ai-review-comment -->',
          },
        ],
      }),
    );
  });

  it('applies merge-risk labels and note wording to pull requests', async () => {
    const octokit = {
      request: vi.fn().mockResolvedValue({data: {}}),
    };
    vi.spyOn(internals, 'getInstallationClient').mockResolvedValue(
      octokit as never,
    );

    await service.applyMergeRiskPredictionToPullRequest(
      4,
      'team/api',
      17,
      {
        priority: 'High',
        reason: 'Touches a shared auth guard.',
      },
      'Original description',
      99,
    );

    expect(issuePriorityService.getRiskLabelName).toHaveBeenCalledWith('High');
    expect(issuePriorityService.upsertPredictionNote).toHaveBeenCalledWith(
      'Original description',
      {
        priority: 'High',
        reason: 'Touches a shared auth guard.',
      },
      {kind: 'risk'},
    );
    expect(octokit.request).toHaveBeenCalledWith(
      'POST /repos/{owner}/{repo}/issues/{issue_number}/labels',
      expect.objectContaining({
        owner: 'team',
        repo: 'api',
        issue_number: 17,
        labels: ['Risk: High'],
      }),
    );
  });

  it('removes prior AI review comments even when there are no fresh findings to post', async () => {
    const octokit = {
      request: vi.fn(),
    };
    vi.spyOn(internals, 'getInstallationClient').mockResolvedValue(
      octokit as never,
    );
    octokit.request
      .mockResolvedValueOnce({
        data: [
          {
            id: 3,
            body: 'Old AI note\n\n<!-- onlab-ai-review-comment -->',
          },
        ],
      })
      .mockResolvedValueOnce({data: {}});

    await service.syncPullRequestReviewComments(4, 'team/api', 17, []);

    expect(octokit.request).toHaveBeenCalledTimes(2);
    expect(octokit.request).not.toHaveBeenCalledWith(
      'POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews',
      expect.anything(),
    );
  });

  it('replaces prior AI reviewer suggestion comments and groups usernames by identical reason', async () => {
    const octokit = {
      request: vi.fn(),
    };
    vi.spyOn(internals, 'getInstallationClient').mockResolvedValue(
      octokit as never,
    );
    octokit.request
      .mockResolvedValueOnce({
        data: [
          {
            id: 10,
            body: 'Old reviewer suggestion\n\n<!-- onlab-ai-reviewer-suggestions-comment -->',
          },
          {
            id: 11,
            body: 'Human note',
          },
        ],
      })
      .mockResolvedValueOnce({data: {}})
      .mockResolvedValueOnce({data: {}});

    await service.syncPullRequestReviewerSuggestionComment(4, 'team/api', 17, [
      {
        username: 'Aron8667',
        reason: 'Backend ownership is needed for migrations and auth.',
      },
      {
        username: 'Aron28',
        reason: 'Backend ownership is needed for migrations and auth.',
      },
      {
        username: 'Aron8667',
        reason: 'Backend ownership is needed for migrations and auth.',
      },
      {
        username: 'someoneelse',
        reason: 'This change also touches deployment-sensitive workflows.',
      },
    ]);

    expect(octokit.request).toHaveBeenNthCalledWith(
      1,
      'GET /repos/{owner}/{repo}/issues/{issue_number}/comments',
      expect.objectContaining({
        owner: 'team',
        repo: 'api',
        issue_number: 17,
      }),
    );
    expect(octokit.request).toHaveBeenNthCalledWith(
      2,
      'DELETE /repos/{owner}/{repo}/issues/comments/{comment_id}',
      expect.objectContaining({
        owner: 'team',
        repo: 'api',
        comment_id: 10,
      }),
    );
    expect(octokit.request).toHaveBeenNthCalledWith(
      3,
      'POST /repos/{owner}/{repo}/issues/{issue_number}/comments',
      expect.objectContaining({
        owner: 'team',
        repo: 'api',
        issue_number: 17,
        body: [
          '### Reviewer suggestions',
          '',
          '@Aron8667, @Aron28',
          '`Reason`: Backend ownership is needed for migrations and auth.',
          '<hr>',
          '',
          '@someoneelse',
          '`Reason`: This change also touches deployment-sensitive workflows.',
          '',
          '<!-- onlab-ai-reviewer-suggestions-comment -->',
        ].join('\n'),
      }),
    );
  });

  it('removes prior AI reviewer suggestion comments when there are no resolved suggestions left', async () => {
    const octokit = {
      request: vi.fn(),
    };
    vi.spyOn(internals, 'getInstallationClient').mockResolvedValue(
      octokit as never,
    );
    octokit.request
      .mockResolvedValueOnce({
        data: [
          {
            id: 12,
            body: 'Old reviewer suggestion\n\n<!-- onlab-ai-reviewer-suggestions-comment -->',
          },
        ],
      })
      .mockResolvedValueOnce({data: {}});

    await service.syncPullRequestReviewerSuggestionComment(
      4,
      'team/api',
      17,
      [],
    );

    expect(octokit.request).toHaveBeenCalledTimes(2);
    expect(octokit.request).not.toHaveBeenCalledWith(
      'POST /repos/{owner}/{repo}/issues/{issue_number}/comments',
      expect.anything(),
    );
  });

  it('removes AI review comments across multiple pages without skipping shifted entries', async () => {
    const octokit = {
      request: vi.fn(),
    };
    vi.spyOn(internals, 'getInstallationClient').mockResolvedValue(
      octokit as never,
    );
    const firstPage = Array.from({length: 100}, (_, index) => ({
      id: index + 1,
      body:
        index >= 98
          ? `AI note ${index}\n\n<!-- onlab-ai-review-comment -->`
          : `Human note ${index}`,
    }));
    const secondPage = [
      {id: 101, body: 'AI note 101\n\n<!-- onlab-ai-review-comment -->'},
      {id: 102, body: 'Human note 102'},
    ];
    octokit.request
      .mockResolvedValueOnce({data: firstPage})
      .mockResolvedValueOnce({data: secondPage})
      .mockResolvedValueOnce({data: {}})
      .mockResolvedValueOnce({data: {}})
      .mockResolvedValueOnce({data: {}});

    await service.syncPullRequestReviewComments(4, 'team/api', 17, []);

    expect(octokit.request).toHaveBeenNthCalledWith(
      1,
      'GET /repos/{owner}/{repo}/pulls/{pull_number}/comments',
      expect.objectContaining({page: 1}),
    );
    expect(octokit.request).toHaveBeenNthCalledWith(
      2,
      'GET /repos/{owner}/{repo}/pulls/{pull_number}/comments',
      expect.objectContaining({page: 2}),
    );
    expect(octokit.request).toHaveBeenNthCalledWith(
      3,
      'DELETE /repos/{owner}/{repo}/pulls/comments/{comment_id}',
      expect.objectContaining({comment_id: 99}),
    );
    expect(octokit.request).toHaveBeenNthCalledWith(
      4,
      'DELETE /repos/{owner}/{repo}/pulls/comments/{comment_id}',
      expect.objectContaining({comment_id: 100}),
    );
    expect(octokit.request).toHaveBeenNthCalledWith(
      5,
      'DELETE /repos/{owner}/{repo}/pulls/comments/{comment_id}',
      expect.objectContaining({comment_id: 101}),
    );
  });

  it('drops findings without matching line content even if the hinted line exists', async () => {
    const octokit = {
      request: vi.fn(),
    };
    vi.spyOn(internals, 'getInstallationClient').mockResolvedValue(
      octokit as never,
    );
    vi.spyOn(service, 'getPullRequestOverview').mockResolvedValue({
      number: 17,
      title: 'Tighten auth',
      body: null,
      state: 'open',
      draft: false,
      mergeable_state: 'clean',
      additions: 3,
      deletions: 1,
      changed_files: 1,
      commits: 1,
      base_ref: 'main',
      head_ref: 'feature/auth',
      head_sha: 'abc123',
      requested_reviewer_logins: [],
    });
    vi.spyOn(service, 'listPullRequestFiles').mockResolvedValue([
      {
        filename: 'src/auth/guard.ts',
        status: 'modified',
        additions: 3,
        deletions: 1,
        changes: 4,
        patch:
          '@@ -10,2 +10,3 @@\n old\n-oldCheck()\n+allowAll()\n+return true\n tail',
      },
    ]);
    octokit.request
      .mockResolvedValueOnce({
        data: [
          {
            id: 1,
            body: 'Existing note\n\n<!-- onlab-ai-review-comment -->',
          },
        ],
      })
      .mockResolvedValueOnce({data: {}});

    await service.syncPullRequestReviewComments(4, 'team/api', 17, [
      {
        path: 'src/auth/guard.ts',
        line: 11,
        body: 'This should be dropped because the content does not match.',
        lineContent: 'nonexistentCall()',
      },
    ]);

    expect(octokit.request).toHaveBeenCalledTimes(2);
    expect(octokit.request).not.toHaveBeenCalledWith(
      'POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews',
      expect.anything(),
    );
  });

  it('drops findings without line content even when the hinted line is an exact changed line', async () => {
    const octokit = {
      request: vi.fn(),
    };
    vi.spyOn(internals, 'getInstallationClient').mockResolvedValue(
      octokit as never,
    );
    vi.spyOn(service, 'getPullRequestOverview').mockResolvedValue({
      number: 17,
      title: 'Tighten auth',
      body: null,
      state: 'open',
      draft: false,
      mergeable_state: 'clean',
      additions: 3,
      deletions: 1,
      changed_files: 1,
      commits: 1,
      base_ref: 'main',
      head_ref: 'feature/auth',
      head_sha: 'abc123',
      requested_reviewer_logins: [],
    });
    vi.spyOn(service, 'listPullRequestFiles').mockResolvedValue([
      {
        filename: 'src/auth/guard.ts',
        status: 'modified',
        additions: 3,
        deletions: 1,
        changes: 4,
        patch:
          '@@ -10,2 +10,3 @@\n old\n-oldCheck()\n+allowAll()\n+return true\n tail',
      },
    ]);
    octokit.request
      .mockResolvedValueOnce({
        data: [],
      })
      .mockResolvedValueOnce({data: {}});

    await service.syncPullRequestReviewComments(4, 'team/api', 17, [
      {
        path: 'src/auth/guard.ts',
        line: 12,
        body: 'This exact changed line should still be dropped.',
      },
    ]);

    expect(octokit.request).toHaveBeenCalledTimes(1);
    expect(octokit.request).not.toHaveBeenCalledWith(
      'POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews',
      expect.anything(),
    );
  });

  it('requests only missing reviewers for a pull request', async () => {
    const octokit = {
      request: vi.fn().mockResolvedValue({data: {}}),
    };
    vi.spyOn(internals, 'getInstallationClient').mockResolvedValue(
      octokit as never,
    );
    vi.spyOn(service, 'getPullRequestOverview').mockResolvedValue({
      number: 17,
      title: 'Tighten auth',
      body: null,
      state: 'open',
      draft: false,
      mergeable_state: 'clean',
      additions: 3,
      deletions: 1,
      changed_files: 1,
      commits: 1,
      base_ref: 'main',
      head_ref: 'feature/auth',
      head_sha: 'abc123',
      requested_reviewer_logins: ['existing-reviewer'],
    });

    await service.requestPullRequestReviewers(4, 'team/api', 17, [
      'existing-reviewer',
      'new-reviewer',
      'new-reviewer',
      '  ',
    ]);

    expect(octokit.request).toHaveBeenCalledWith(
      'POST /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers',
      expect.objectContaining({
        owner: 'team',
        repo: 'api',
        pull_number: 17,
        reviewers: ['new-reviewer'],
      }),
    );
  });
});
