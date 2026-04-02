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
              'Anchor each finding to the most specific changed line that introduces the problem',
            ),
          }),
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining(
              'Include the exact changed code line as "line_content"',
            ),
          }),
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining(
              'prefer an exact changed line number over guessing a nearby line',
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
    });
  });
});
