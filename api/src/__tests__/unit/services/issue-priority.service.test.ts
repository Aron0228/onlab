import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {IssuePriorityService} from '../../../services';

describe('IssuePriorityService (unit)', () => {
  const originalCacheTtl = process.env.ISSUE_PRIORITY_CACHE_TTL_MS;
  let ollamaService: {
    chatJson: ReturnType<typeof vi.fn>;
  };
  let githubService: {
    getRepositoryOverview: ReturnType<typeof vi.fn>;
    listRepositoryDirectory: ReturnType<typeof vi.fn>;
    getRepositoryFileContents: ReturnType<typeof vi.fn>;
  };
  let service: IssuePriorityService;

  beforeEach(() => {
    delete process.env.ISSUE_PRIORITY_CACHE_TTL_MS;
    ollamaService = {
      chatJson: vi.fn(),
    };
    githubService = {
      getRepositoryOverview: vi.fn().mockResolvedValue({
        name: 'api',
        full_name: 'team/api',
        description: 'LoopBack backend',
        default_branch: 'main',
        language: 'TypeScript',
        topics: ['loopback', 'api'],
        open_issues_count: 0,
      }),
      listRepositoryDirectory: vi.fn().mockResolvedValue([
        {name: 'package.json', path: 'package.json', type: 'file', size: 200},
        {name: 'src', path: 'src', type: 'dir'},
      ]),
      getRepositoryFileContents: vi.fn().mockResolvedValue('{}'),
    };

    service = new IssuePriorityService(
      ollamaService as never,
      (async () => githubService as never) as never,
    );
  });

  afterEach(() => {
    if (originalCacheTtl === undefined) {
      delete process.env.ISSUE_PRIORITY_CACHE_TTL_MS;
      return;
    }

    process.env.ISSUE_PRIORITY_CACHE_TTL_MS = originalCacheTtl;
  });

  it('normalizes the model response into a valid prediction', async () => {
    ollamaService.chatJson.mockResolvedValue({
      type: 'final',
      priority: 'veryhigh',
      reason: 'Authentication bypass is explicitly confirmed.',
      estimated_hours: 8.4,
      estimation_confidence: 'MEDIUM',
    });

    await expect(
      service.predictIssuePriority({
        title: 'Login bypass',
        description: 'Users can access admin routes without authentication.',
      }),
    ).resolves.toEqual({
      priority: 'Very-High',
      reason: 'Authentication bypass is explicitly confirmed.',
      estimatedHours: 8,
      estimationConfidence: 'medium',
    });
  });

  it('removes the previous AI note before appending a new one', () => {
    const withNote = service.upsertPredictionNote('Original description', {
      priority: 'High',
      reason: 'The billing module is unusable.',
      estimatedHours: 4,
      estimationConfidence: 'high',
    });

    const updated = service.upsertPredictionNote(withNote, {
      priority: 'Medium',
      reason: 'Only one feature is broken.',
      estimatedHours: 2,
      estimationConfidence: 'medium',
    });

    expect(updated).toContain('Original description');
    expect(updated).toContain('AI priority prediction: Medium');
    expect(updated).toContain('Estimated effort: 2h (medium confidence)');
    expect(updated).not.toContain('AI priority prediction: High');
  });

  it('falls back to Unknown when the prediction request fails', async () => {
    ollamaService.chatJson.mockRejectedValue(new Error('ollama unavailable'));

    await expect(
      service.predictIssuePriority({
        title: 'Unknown failure',
        description: 'No further details.',
      }),
    ).resolves.toEqual({
      priority: 'Unknown',
      reason: 'AI prioritization unavailable.',
      estimatedHours: null,
      estimationConfidence: 'low',
    });
  });

  it('reuses cached predictions for identical issue text', async () => {
    ollamaService.chatJson.mockResolvedValue({
      type: 'final',
      priority: 'Medium',
      reason: 'One workflow is broken.',
      estimated_hours: 4,
      estimation_confidence: 'medium',
    });
    const input = {
      title: 'Broken export',
      description: 'The CSV export fails.',
      repositoryFullName: 'team/api',
    };

    await expect(service.predictIssuePriority(input)).resolves.toEqual({
      priority: 'Medium',
      reason: 'One workflow is broken.',
      estimatedHours: 4,
      estimationConfidence: 'medium',
    });
    await expect(service.predictIssuePriority(input)).resolves.toEqual({
      priority: 'Medium',
      reason: 'One workflow is broken.',
      estimatedHours: 4,
      estimationConfidence: 'medium',
    });

    expect(ollamaService.chatJson).toHaveBeenCalledTimes(1);
  });

  it('shares in-flight predictions for duplicate concurrent requests', async () => {
    let resolvePrediction!: (value: unknown) => void;
    ollamaService.chatJson.mockReturnValue(
      new Promise(resolve => {
        resolvePrediction = resolve;
      }),
    );
    const input = {
      title: 'Concurrent issue',
      description: 'The same issue arrived twice.',
      repositoryFullName: 'team/api',
    };
    const firstPrediction = service.predictIssuePriority(input);
    const secondPrediction = service.predictIssuePriority(input);

    resolvePrediction({
      type: 'final',
      priority: 'Low',
      reason: 'Small contained issue.',
      estimated_hours: 1,
      estimation_confidence: 'high',
    });

    await expect(
      Promise.all([firstPrediction, secondPrediction]),
    ).resolves.toEqual([
      {
        priority: 'Low',
        reason: 'Small contained issue.',
        estimatedHours: 1,
        estimationConfidence: 'high',
      },
      {
        priority: 'Low',
        reason: 'Small contained issue.',
        estimatedHours: 1,
        estimationConfidence: 'high',
      },
    ]);
    expect(ollamaService.chatJson).toHaveBeenCalledTimes(1);
  });

  it('can inspect repository context before producing an estimate', async () => {
    ollamaService.chatJson
      .mockResolvedValueOnce({
        type: 'tool_call',
        tool: 'get_repository_file_contents',
        arguments: {path: 'package.json'},
      })
      .mockResolvedValueOnce({
        type: 'final',
        priority: 'High',
        reason:
          'The repository uses LoopBack service layers and auth concerns usually span multiple files.',
        estimated_hours: 8,
        estimation_confidence: 'high',
      });

    await expect(
      service.predictIssuePriority({
        installationId: 11,
        repositoryFullName: 'team/api',
        title: 'Broken login',
        description: 'Users cannot authenticate through the main login flow.',
      }),
    ).resolves.toEqual({
      priority: 'High',
      reason:
        'The repository uses LoopBack service layers and auth concerns usually span multiple files.',
      estimatedHours: 8,
      estimationConfidence: 'high',
    });

    expect(githubService.getRepositoryOverview).toHaveBeenCalledWith(
      11,
      'team/api',
    );
    expect(githubService.listRepositoryDirectory).toHaveBeenCalledWith(
      11,
      'team/api',
      '',
    );
    expect(githubService.getRepositoryFileContents).toHaveBeenCalledWith(
      11,
      'team/api',
      'package.json',
    );
    expect(ollamaService.chatJson).toHaveBeenCalledTimes(2);
  });

  it('continues with issue text when initial repository evidence fails', async () => {
    githubService.getRepositoryOverview.mockRejectedValueOnce(
      new Error('GitHub API unavailable'),
    );
    ollamaService.chatJson.mockResolvedValue({
      type: 'final',
      priority: 'Medium',
      reason: 'The issue still describes one broken workflow.',
      estimated_hours: 3,
      estimation_confidence: 'low',
    });

    await expect(
      service.predictIssuePriority({
        installationId: 11,
        repositoryFullName: 'team/api',
        title: 'Broken billing export',
        description: 'The CSV export fails for billing reports.',
      }),
    ).resolves.toEqual({
      priority: 'Medium',
      reason: 'The issue still describes one broken workflow.',
      estimatedHours: 3,
      estimationConfidence: 'low',
    });

    expect(ollamaService.chatJson).toHaveBeenCalledTimes(1);
    expect(ollamaService.chatJson.mock.calls[0][0].messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          content: expect.stringContaining(
            'Repository evidence is unavailable',
          ),
        }),
      ]),
    );
  });

  it('returns directory tool errors without aborting prediction', async () => {
    githubService.listRepositoryDirectory
      .mockResolvedValueOnce([
        {name: 'package.json', path: 'package.json', type: 'file', size: 200},
      ])
      .mockRejectedValueOnce(new Error('Directory not found'));
    ollamaService.chatJson
      .mockResolvedValueOnce({
        type: 'tool_call',
        tool: 'list_repository_directory',
        arguments: {path: 'missing'},
      })
      .mockResolvedValueOnce({
        type: 'final',
        priority: 'High',
        reason: 'The issue still blocks the authentication module.',
        estimated_hours: 8,
        estimation_confidence: 'medium',
      });

    await expect(
      service.predictIssuePriority({
        installationId: 11,
        repositoryFullName: 'team/api',
        title: 'Broken login',
        description: 'Users cannot authenticate through the main login flow.',
      }),
    ).resolves.toEqual({
      priority: 'High',
      reason: 'The issue still blocks the authentication module.',
      estimatedHours: 8,
      estimationConfidence: 'medium',
    });

    expect(ollamaService.chatJson).toHaveBeenCalledTimes(2);
    expect(ollamaService.chatJson.mock.calls[1][0].messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          content: expect.stringContaining('Directory not found'),
        }),
      ]),
    );
  });

  it('keeps tool-assisted prediction resilient across invalid tool responses', async () => {
    const longFile = 'x'.repeat(7000);
    githubService.getRepositoryOverview
      .mockResolvedValueOnce({
        name: 'api',
        full_name: 'team/api',
        description: 'LoopBack backend',
        default_branch: 'main',
        language: 'TypeScript',
        topics: ['loopback', 'api'],
        open_issues_count: 0,
      })
      .mockResolvedValueOnce({
        name: 'api',
        full_name: 'team/api',
        description: null,
        default_branch: null,
        language: null,
        topics: [],
        open_issues_count: 0,
      })
      .mockRejectedValueOnce('overview failed');
    githubService.listRepositoryDirectory
      .mockResolvedValueOnce([
        {name: 'package.json', path: 'package.json', type: 'file', size: 200},
      ])
      .mockResolvedValueOnce([
        {name: 'src', path: 'src', type: 'dir'},
        {name: 'test', path: 'test', type: 'dir'},
      ]);
    githubService.getRepositoryFileContents
      .mockResolvedValueOnce(longFile)
      .mockRejectedValueOnce('file failed');
    ollamaService.chatJson
      .mockResolvedValueOnce({nonsense: true})
      .mockResolvedValueOnce({
        type: 'tool_call',
        tool: 'unknown_tool',
      })
      .mockResolvedValueOnce({
        type: 'tool_call',
        tool: 'get_repository_overview',
      })
      .mockResolvedValueOnce({
        type: 'tool_call',
        tool: 'get_repository_overview',
      })
      .mockResolvedValueOnce({
        type: 'tool_call',
        tool: 'list_repository_directory',
        arguments: {path: 'src', limit: 1.9},
      })
      .mockResolvedValueOnce({
        type: 'tool_call',
        tool: 'get_repository_file_contents',
        arguments: {path: ''},
      })
      .mockResolvedValueOnce({
        type: 'tool_call',
        tool: 'get_repository_file_contents',
        arguments: {path: 'src/index.ts'},
      })
      .mockResolvedValueOnce({
        type: 'tool_call',
        tool: 'get_repository_file_contents',
        arguments: {path: 'src/missing.ts'},
      })
      .mockResolvedValueOnce({
        type: 'final',
        priority: 'Low',
        reason: 'The available evidence indicates a small contained issue.',
        estimated_hours: 300,
        estimation_confidence: 'certain',
      });

    await expect(
      service.predictIssuePriority({
        installationId: 11,
        repositoryFullName: 'team/api',
        title: 'Minor config cleanup',
        description: 'One config file needs cleanup.',
      }),
    ).resolves.toEqual({
      priority: 'Low',
      reason: 'The available evidence indicates a small contained issue.',
      estimatedHours: null,
      estimationConfidence: null,
    });

    expect(ollamaService.chatJson).toHaveBeenCalledTimes(9);
    expect(ollamaService.chatJson.mock.calls[8][0].messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          content: expect.stringContaining('unknown_tool'),
        }),
        expect.objectContaining({
          content: expect.stringContaining('Unknown tool execution error.'),
        }),
        expect.objectContaining({
          content: expect.stringContaining('[truncated]'),
        }),
      ]),
    );
  });

  it('falls back when the model exceeds the tool-call budget', async () => {
    ollamaService.chatJson.mockResolvedValue({
      type: 'tool_call',
      tool: 'get_repository_overview',
    });

    await expect(
      service.predictIssuePriority({
        installationId: 11,
        repositoryFullName: 'team/api',
        title: 'Looping estimate',
        description: 'The model keeps asking for tools.',
      }),
    ).resolves.toEqual({
      priority: 'Unknown',
      reason: 'AI prioritization unavailable.',
      estimatedHours: null,
      estimationConfidence: 'low',
    });

    expect(ollamaService.chatJson).toHaveBeenCalledTimes(9);
  });

  it('continues when GitHub service is not bound', async () => {
    const serviceWithoutGithub = new IssuePriorityService(
      ollamaService as never,
      (async () => undefined) as never,
    );
    ollamaService.chatJson
      .mockResolvedValueOnce({
        type: 'tool_call',
        tool: 'get_repository_overview',
      })
      .mockResolvedValueOnce({
        type: 'final',
        priority: 'Medium',
        reason: 'The issue text is enough to classify one broken workflow.',
      });

    await expect(
      serviceWithoutGithub.predictIssuePriority({
        installationId: 11,
        repositoryFullName: 'team/api',
        title: 'Broken export',
        description: 'The billing export workflow fails.',
      }),
    ).resolves.toEqual({
      priority: 'Medium',
      reason: 'The issue text is enough to classify one broken workflow.',
      estimatedHours: null,
      estimationConfidence: null,
    });

    expect(ollamaService.chatJson.mock.calls[1][0].messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          content: expect.stringContaining('GitHub service is unavailable'),
        }),
      ]),
    );
  });

  it('returns structured tool errors when repository context is missing', async () => {
    ollamaService.chatJson
      .mockResolvedValueOnce({
        type: 'tool_call',
        tool: 'get_repository_overview',
      })
      .mockResolvedValueOnce({
        type: 'final',
        priority: 'Low',
        reason: 'The issue text still indicates a small fix.',
      });

    await expect(
      service.predictIssuePriority({
        title: 'Typo',
        description: 'A label is misspelled.',
      }),
    ).resolves.toEqual({
      priority: 'Low',
      reason: 'The issue text still indicates a small fix.',
      estimatedHours: null,
      estimationConfidence: null,
    });

    expect(ollamaService.chatJson.mock.calls[1][0].messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          content: expect.stringContaining(
            'GitHub installation context is unavailable',
          ),
        }),
      ]),
    );
  });

  it('falls back after repeated invalid non-tool responses', async () => {
    ollamaService.chatJson.mockResolvedValue({nonsense: true});

    await expect(
      service.predictIssuePriority({
        title: 'Invalid loop',
        description: 'The model keeps returning invalid JSON shapes.',
      }),
    ).resolves.toEqual({
      priority: 'Unknown',
      reason: 'AI prioritization unavailable.',
      estimatedHours: null,
      estimationConfidence: 'low',
    });

    expect(ollamaService.chatJson).toHaveBeenCalledTimes(9);
  });

  it('can write a merge-risk note for pull requests', () => {
    const updated = service.upsertPredictionNote(
      'Original description',
      {
        priority: 'High',
        reason: 'The auth guard change has broad blast radius.',
      },
      {kind: 'risk'},
    );

    expect(updated).toContain('AI merge risk prediction: High');
    expect(updated).not.toContain('AI priority prediction: High');
  });
});
