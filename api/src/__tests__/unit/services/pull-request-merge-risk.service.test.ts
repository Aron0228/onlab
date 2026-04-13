import {beforeEach, describe, expect, it, vi} from 'vitest';
import {PullRequestMergeRiskService} from '../../../services';

describe('PullRequestMergeRiskService (unit)', () => {
  let ollamaService: {
    chatJson: ReturnType<typeof vi.fn>;
  };
  let githubService: {
    getPullRequestOverview: ReturnType<typeof vi.fn>;
    listPullRequestFiles: ReturnType<typeof vi.fn>;
    getPullRequestFileContents: ReturnType<typeof vi.fn>;
  };
  let service: PullRequestMergeRiskService;

  beforeEach(() => {
    ollamaService = {
      chatJson: vi.fn(),
    };
    githubService = {
      getPullRequestOverview: vi.fn(),
      listPullRequestFiles: vi.fn(),
      getPullRequestFileContents: vi.fn(),
    };

    service = new PullRequestMergeRiskService(
      ollamaService as never,
      githubService as never,
    );
  });

  it('returns the final prediction directly when no tool is needed', async () => {
    githubService.getPullRequestOverview.mockResolvedValue({
      changed_files: 1,
      additions: 4,
      deletions: 0,
      commits: 1,
      draft: false,
      mergeable_state: 'clean',
      head_ref: 'feature/auth',
      base_ref: 'main',
    });
    githubService.listPullRequestFiles.mockResolvedValue([
      {
        filename: 'src/auth/middleware.ts',
        status: 'modified',
        additions: 4,
        deletions: 0,
        changes: 4,
        patch: "@@ -0,0 +1,1 @@\n+throw new Error('oops')",
      },
    ]);
    ollamaService.chatJson.mockResolvedValue({
      type: 'final',
      priority: 'High',
      reason: 'This change affects authentication and shared request handling.',
      findings: [
        {
          path: 'src/auth/middleware.ts',
          line: 12,
          body: 'Throwing here can turn bad credentials into a 500 for every request.',
          line_content: "throw new Error('oops')",
        },
      ],
    });

    await expect(
      service.predictMergeRisk({
        installationId: 12,
        repositoryFullName: 'team/api',
        pullRequestNumber: 44,
        title: 'Adjust auth middleware',
        description: 'Touches shared auth guards.',
      }),
    ).resolves.toEqual({
      priority: 'High',
      reason: 'This change affects authentication and shared request handling.',
      findings: [
        {
          path: 'src/auth/middleware.ts',
          line: 12,
          body: 'Throwing here can turn bad credentials into a 500 for every request.',
          lineContent: "throw new Error('oops')",
        },
      ],
      reviewerExpertiseSuggestions: [],
      reviewerSuggestions: [],
    });

    expect(ollamaService.chatJson).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining(
              'explicitly pinpoint the riskiest code by naming the file path and the faulty or risky logic involved',
            ),
          }),
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining(
              'Anchor each finding by quoting the exact changed code line as "line_content"',
            ),
          }),
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining(
              'Treat "line" only as an optional rough hint.',
            ),
          }),
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining(
              'reviewer expertise matches from the provided live workspace reviewer expertise coverage.',
            ),
          }),
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('Annotated patch:'),
          }),
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining("NEW 1: throw new Error('oops')"),
          }),
        ]),
      }),
    );
  });

  it('executes requested tools and then returns the final prediction', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    githubService.getPullRequestOverview.mockResolvedValue({
      changed_files: 2,
      additions: 54,
      deletions: 15,
      commits: 2,
      draft: false,
      mergeable_state: 'unstable',
      head_ref: 'feature/auth-rewrite',
      base_ref: 'main',
    });

    ollamaService.chatJson
      .mockResolvedValueOnce({
        type: 'tool_call',
        tool: 'list_pull_request_files',
        arguments: {limit: 2},
        reason: 'Need to inspect the changed surface area.',
      })
      .mockResolvedValueOnce({
        type: 'final',
        priority: 'Very-High',
        reason: 'The PR includes risky authentication and migration changes.',
        findings: [],
      });

    githubService.listPullRequestFiles.mockResolvedValue([
      {
        filename: 'src/auth/guard.ts',
        status: 'modified',
        additions: 42,
        deletions: 15,
        changes: 57,
        patch: '@@ -10,1 +10,1 @@\n+critical auth change',
      },
      {
        filename: 'db/migrations/001.sql',
        status: 'added',
        additions: 12,
        deletions: 0,
        changes: 12,
        patch: '@@ -0,0 +1,1 @@\n+alter table users',
      },
    ]);

    await expect(
      service.predictMergeRisk({
        installationId: 55,
        repositoryFullName: 'team/api',
        pullRequestNumber: 91,
        title: 'Rewrite auth flow',
        description: 'Also updates user schema.',
      }),
    ).resolves.toEqual({
      priority: 'Very-High',
      reason: 'The PR includes risky authentication and migration changes.',
      findings: [],
      reviewerExpertiseSuggestions: [],
      reviewerSuggestions: [],
    });

    expect(githubService.listPullRequestFiles).toHaveBeenCalledWith(
      55,
      'team/api',
      91,
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      'Pull request merge risk AI requested tool',
      expect.objectContaining({
        repositoryFullName: 'team/api',
        pullRequestNumber: 91,
        tool: 'list_pull_request_files',
      }),
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      'Pull request merge risk AI tool completed',
      expect.objectContaining({
        repositoryFullName: 'team/api',
        pullRequestNumber: 91,
        tool: 'list_pull_request_files',
      }),
    );

    consoleLogSpy.mockRestore();
  });

  it('keeps the analysis running when file contents are inaccessible to the integration', async () => {
    githubService.getPullRequestOverview.mockResolvedValue({
      changed_files: 1,
      additions: 8,
      deletions: 2,
      commits: 1,
      draft: false,
      mergeable_state: 'clean',
      head_ref: 'feature/upload-hardening',
      base_ref: 'main',
    });
    githubService.listPullRequestFiles.mockResolvedValue([
      {
        filename: 'api/src/repositories/system/file.repository.ts',
        status: 'modified',
        additions: 8,
        deletions: 2,
        changes: 10,
        patch:
          '@@ -20,2 +20,3 @@\n-const a = 1;\n+const command = input.command;\n+await exec(command);\n tail',
      },
    ]);
    githubService.getPullRequestFileContents.mockRejectedValue(
      Object.assign(new Error('Resource not accessible by integration'), {
        status: 403,
      }),
    );
    ollamaService.chatJson
      .mockResolvedValueOnce({
        type: 'tool_call',
        tool: 'get_pull_request_file_contents',
        arguments: {path: 'api/src/repositories/system/file.repository.ts'},
        reason: 'Need the file contents to inspect risky execution logic.',
      })
      .mockResolvedValueOnce({
        type: 'final',
        priority: 'High',
        reason:
          'The diff still shows command execution changes in api/src/repositories/system/file.repository.ts.',
        findings: [],
      });

    await expect(
      service.predictMergeRisk({
        installationId: 99,
        repositoryFullName: 'team/api',
        pullRequestNumber: 7,
        title: 'Adjust file repository',
        description: 'Touches upload and execution flow.',
      }),
    ).resolves.toEqual({
      priority: 'High',
      reason:
        'The diff still shows command execution changes in api/src/repositories/system/file.repository.ts.',
      findings: [],
      reviewerExpertiseSuggestions: [],
      reviewerSuggestions: [],
    });

    expect(githubService.getPullRequestFileContents).toHaveBeenCalledWith(
      99,
      'team/api',
      7,
      'api/src/repositories/system/file.repository.ts',
    );
    expect(githubService.listPullRequestFiles).toHaveBeenCalledWith(
      99,
      'team/api',
      7,
    );
    expect(ollamaService.chatJson).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining(
              'GitHub API error 403: Resource not accessible by integration',
            ),
          }),
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('annotated_patch'),
          }),
        ]),
      }),
    );
  });

  it('drops malformed review findings from the AI response', async () => {
    githubService.getPullRequestOverview.mockResolvedValue({
      changed_files: 1,
      additions: 3,
      deletions: 1,
      commits: 1,
      draft: false,
      mergeable_state: 'clean',
      head_ref: 'feature/fix',
      base_ref: 'main',
    });
    githubService.listPullRequestFiles.mockResolvedValue([
      {
        filename: 'src/app.ts',
        status: 'modified',
        additions: 3,
        deletions: 1,
        changes: 4,
        patch: '@@ -10,1 +10,3 @@\n-old\n+new\n+more\n tail',
      },
    ]);
    ollamaService.chatJson.mockResolvedValue({
      type: 'final',
      priority: 'Medium',
      reason: 'src/app.ts changes request flow.',
      findings: [
        {
          path: 'src/app.ts',
          line: 10,
          body: 'Valid finding.',
          line_content: 'new',
        },
        {path: '', line: 11, body: 'Missing path.'},
        {path: 'src/app.ts', line: 0, body: 'Bad line.'},
        {path: 'src/app.ts', line: 11, body: ''},
      ],
    });

    await expect(
      service.predictMergeRisk({
        installationId: 12,
        repositoryFullName: 'team/api',
        pullRequestNumber: 45,
        title: 'Adjust request flow',
        description: 'Touches shared middleware.',
      }),
    ).resolves.toEqual({
      priority: 'Medium',
      reason: 'src/app.ts changes request flow.',
      findings: [
        {
          path: 'src/app.ts',
          line: 10,
          body: 'Valid finding.',
          lineContent: 'new',
        },
      ],
      reviewerExpertiseSuggestions: [],
      reviewerSuggestions: [],
    });
  });

  it('normalizes reviewer expertise suggestions from listed workspace expertise candidates', async () => {
    githubService.getPullRequestOverview.mockResolvedValue({
      changed_files: 1,
      additions: 2,
      deletions: 0,
      commits: 1,
      draft: false,
      mergeable_state: 'clean',
      head_ref: 'feature/ui',
      base_ref: 'main',
    });
    githubService.listPullRequestFiles.mockResolvedValue([
      {
        filename: 'src/ui/button.ts',
        status: 'modified',
        additions: 2,
        deletions: 0,
        changes: 2,
        patch: '@@ -1,1 +1,2 @@\n+const variant = "primary";',
      },
    ]);
    ollamaService.chatJson.mockResolvedValue({
      type: 'final',
      priority: 'Low',
      reason: 'Small UI tweak.',
      findings: [],
      reviewer_expertise_suggestions: [
        {
          expertise: 'Frontend Development',
          reason: 'Owns frontend component expertise.',
        },
        {
          expertise: 'Frontend Development',
          reason: 'Duplicate expertise should be ignored.',
        },
      ],
    });

    await expect(
      service.predictMergeRisk({
        installationId: 12,
        repositoryFullName: 'team/api',
        pullRequestNumber: 46,
        title: 'Adjust button variant',
        description: 'Small UI tweak.',
        reviewerExpertiseCandidates: [
          {
            name: 'Frontend Development',
          },
        ],
      }),
    ).resolves.toEqual({
      priority: 'Low',
      reason: 'Small UI tweak.',
      findings: [],
      reviewerExpertiseSuggestions: [
        {
          expertise: 'Frontend Development',
          reason: 'Owns frontend component expertise.',
        },
      ],
      reviewerSuggestions: [],
    });

    expect(ollamaService.chatJson).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining(
              'Live workspace expertise candidates:',
            ),
          }),
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('expertise=Frontend Development'),
          }),
        ]),
      }),
    );
  });

  it('drops reviewer expertise suggestions that are not listed workspace expertise candidates', async () => {
    githubService.getPullRequestOverview.mockResolvedValue({
      changed_files: 1,
      additions: 2,
      deletions: 0,
      commits: 1,
      draft: false,
      mergeable_state: 'clean',
      head_ref: 'feature/security',
      base_ref: 'main',
    });
    githubService.listPullRequestFiles.mockResolvedValue([
      {
        filename: 'src/auth/guard.ts',
        status: 'modified',
        additions: 2,
        deletions: 0,
        changes: 2,
        patch: '@@ -1,1 +1,2 @@\n+if (token === "1") return true;',
      },
    ]);
    ollamaService.chatJson.mockResolvedValue({
      type: 'final',
      priority: 'Very-High',
      reason: 'Unsafe auth bypass.',
      findings: [],
      reviewer_expertise_suggestions: [
        {
          expertise: 'Security',
          reason: 'Should review security.',
        },
      ],
    });

    await expect(
      service.predictMergeRisk({
        installationId: 12,
        repositoryFullName: 'team/api',
        pullRequestNumber: 47,
        title: 'Bypass token validation',
        description: 'Unsafe auth change.',
        reviewerExpertiseCandidates: [
          {
            name: 'Frontend Development',
          },
        ],
      }),
    ).resolves.toEqual({
      priority: 'Very-High',
      reason: 'Unsafe auth bypass.',
      findings: [],
      reviewerExpertiseSuggestions: [],
      reviewerSuggestions: [],
    });
  });

  it('limits reviewer expertise suggestions to two normalized matches', async () => {
    githubService.getPullRequestOverview.mockResolvedValue({
      changed_files: 1,
      additions: 2,
      deletions: 0,
      commits: 1,
      draft: false,
      mergeable_state: 'clean',
      head_ref: 'feature/full-stack',
      base_ref: 'main',
    });
    githubService.listPullRequestFiles.mockResolvedValue([
      {
        filename: 'src/feature.ts',
        status: 'modified',
        additions: 2,
        deletions: 0,
        changes: 2,
        patch: '@@ -1,1 +1,2 @@\n+const featureFlag = true;',
      },
    ]);
    ollamaService.chatJson.mockResolvedValue({
      type: 'final',
      priority: 'Medium',
      reason: 'Touches multiple system areas.',
      findings: [],
      reviewer_expertise_suggestions: [
        {
          expertise: ' frontend   development ',
          reason: 'UI changes are involved.',
        },
        {
          expertise: 'backend development',
          reason: 'API changes are involved.',
        },
        {
          expertise: 'database',
          reason: 'Should not be included because only two are allowed.',
        },
      ],
    });

    await expect(
      service.predictMergeRisk({
        installationId: 12,
        repositoryFullName: 'team/api',
        pullRequestNumber: 48,
        title: 'Touch multiple layers',
        description: 'UI and API changes.',
        reviewerExpertiseCandidates: [
          {name: 'Frontend Development'},
          {name: 'Backend Development'},
          {name: 'Database'},
        ],
      }),
    ).resolves.toEqual({
      priority: 'Medium',
      reason: 'Touches multiple system areas.',
      findings: [],
      reviewerExpertiseSuggestions: [
        {
          expertise: 'Frontend Development',
          reason: 'UI changes are involved.',
        },
        {
          expertise: 'Backend Development',
          reason: 'API changes are involved.',
        },
      ],
      reviewerSuggestions: [],
    });
  });

  it('falls back cleanly when GitHub installation context is missing', async () => {
    ollamaService.chatJson.mockResolvedValue({
      type: 'final',
      priority: 'Low',
      reason: 'Limited evidence but looks small.',
      findings: [],
      reviewer_expertise_suggestions: [
        {
          expertise: 'Frontend Development',
          reason: 'UI changes are involved.',
        },
      ],
    });

    await expect(
      service.predictMergeRisk({
        installationId: null,
        repositoryFullName: 'team/api',
        pullRequestNumber: 49,
        title: 'Small tweak',
        description: 'Missing installation context.',
        reviewerExpertiseCandidates: [{name: 'Frontend Development'}],
      }),
    ).resolves.toEqual({
      priority: 'Low',
      reason: 'Limited evidence but looks small.',
      findings: [],
      reviewerExpertiseSuggestions: [
        {
          expertise: 'Frontend Development',
          reason: 'UI changes are involved.',
        },
      ],
      reviewerSuggestions: [],
    });

    expect(githubService.getPullRequestOverview).not.toHaveBeenCalled();
    expect(githubService.listPullRequestFiles).not.toHaveBeenCalled();
    expect(ollamaService.chatJson).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining(
              'Changed-file evidence is unavailable because GitHub installation context is missing.',
            ),
          }),
        ]),
      }),
    );
  });
});
