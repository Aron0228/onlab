import {beforeEach, describe, expect, it, vi} from 'vitest';
import {IssuePriorityService} from '../../../services';

describe('IssuePriorityService (unit)', () => {
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
