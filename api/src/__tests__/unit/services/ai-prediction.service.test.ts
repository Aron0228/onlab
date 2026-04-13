import {beforeEach, describe, expect, it, vi} from 'vitest';

import {AIPredictionService} from '../../../services';

describe('AIPredictionService (unit)', () => {
  let aiPredictionRepository: {
    findOne: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    createAll: ReturnType<typeof vi.fn>;
    updateById: ReturnType<typeof vi.fn>;
    deleteById: ReturnType<typeof vi.fn>;
    deleteAll: ReturnType<typeof vi.fn>;
  };
  let service: AIPredictionService;

  beforeEach(() => {
    aiPredictionRepository = {
      findOne: vi.fn(),
      create: vi.fn().mockResolvedValue(undefined),
      createAll: vi.fn().mockResolvedValue(undefined),
      updateById: vi.fn().mockResolvedValue(undefined),
      deleteById: vi.fn().mockResolvedValue(undefined),
      deleteAll: vi.fn().mockResolvedValue(undefined),
    };

    service = new AIPredictionService(aiPredictionRepository as never);
  });

  it('creates a new normalized prediction when one does not exist', async () => {
    aiPredictionRepository.findOne.mockResolvedValue(null);

    await service.syncPrediction({
      sourceType: 'github-issue',
      sourceId: 11,
      predictionType: 'issue-priority',
      priority: ' High ',
      reason: ' Needs attention ',
      findings: [],
      reviewerSuggestions: [],
    });

    expect(aiPredictionRepository.create).toHaveBeenCalledWith({
      sourceType: 'github-issue',
      sourceId: 11,
      predictionType: 'issue-priority',
      priority: 'High',
      reason: 'Needs attention',
      findings: [],
      reviewerSuggestions: [],
    });
  });

  it('updates an existing prediction when normalized content is present', async () => {
    aiPredictionRepository.findOne.mockResolvedValue({id: 5});

    await service.syncPrediction({
      sourceType: 'github-pull-request',
      sourceId: 22,
      predictionType: 'pull-request-merge-risk',
      priority: 'Medium',
      reason: 'Touches shared auth flow.',
      findings: [
        {
          path: 'src/auth.ts',
          line: 18,
          body: 'Guard was removed.',
        },
      ],
      reviewerSuggestions: [
        {
          userId: 9,
          username: 'security-owner',
          reason: 'Owns auth review.',
        },
      ],
    });

    expect(aiPredictionRepository.updateById).toHaveBeenCalledWith(5, {
      priority: 'Medium',
      reason: 'Touches shared auth flow.',
      findings: [
        {
          path: 'src/auth.ts',
          line: 18,
          body: 'Guard was removed.',
        },
      ],
      reviewerSuggestions: [
        {
          userId: 9,
          username: 'security-owner',
          reason: 'Owns auth review.',
        },
      ],
    });
  });

  it('preserves explicit empty findings arrays so stale findings can be cleared', async () => {
    aiPredictionRepository.findOne.mockResolvedValue({id: 6});

    await service.syncPrediction({
      sourceType: 'github-pull-request',
      sourceId: 22,
      predictionType: 'pull-request-merge-risk',
      priority: 'Low',
      reason: 'Latest run found no actionable review findings.',
      findings: [],
      reviewerSuggestions: [],
    });

    expect(aiPredictionRepository.updateById).toHaveBeenCalledWith(6, {
      priority: 'Low',
      reason: 'Latest run found no actionable review findings.',
      findings: [],
      reviewerSuggestions: [],
    });
  });

  it('deletes an existing prediction when the normalized payload is empty', async () => {
    aiPredictionRepository.findOne.mockResolvedValue({id: 9});

    await service.syncPrediction({
      sourceType: 'github-issue',
      sourceId: 3,
      predictionType: 'issue-priority',
      priority: '   ',
      reason: null,
      findings: [],
      reviewerSuggestions: [],
    });

    expect(aiPredictionRepository.deleteById).toHaveBeenCalledWith(9);
    expect(aiPredictionRepository.create).not.toHaveBeenCalled();
    expect(aiPredictionRepository.updateById).not.toHaveBeenCalled();
  });

  it('does nothing when the normalized payload is empty and no prediction exists', async () => {
    aiPredictionRepository.findOne.mockResolvedValue(null);

    await service.syncPrediction({
      sourceType: 'github-issue',
      sourceId: 3,
      predictionType: 'issue-priority',
      priority: undefined,
      reason: undefined,
      findings: null,
      reviewerSuggestions: null,
    });

    expect(aiPredictionRepository.deleteById).not.toHaveBeenCalled();
    expect(aiPredictionRepository.create).not.toHaveBeenCalled();
    expect(aiPredictionRepository.updateById).not.toHaveBeenCalled();
  });

  it('filters empty predictions out of bulk creation', async () => {
    await service.createPredictionsBulk([
      {
        sourceType: 'github-issue',
        sourceId: 1,
        predictionType: 'issue-priority',
        priority: 'High',
        reason: 'Important',
        reviewerSuggestions: [],
      },
      {
        sourceType: 'github-issue',
        sourceId: 2,
        predictionType: 'issue-priority',
        priority: ' ',
        reason: '',
        findings: [],
      },
    ]);

    expect(aiPredictionRepository.createAll).toHaveBeenCalledWith([
      {
        sourceType: 'github-issue',
        sourceId: 1,
        predictionType: 'issue-priority',
        priority: 'High',
        reason: 'Important',
        findings: undefined,
        reviewerSuggestions: [],
      },
    ]);
  });

  it('skips bulk creation when every prediction is empty after normalization', async () => {
    await service.createPredictionsBulk([
      {
        sourceType: 'github-issue',
        sourceId: 1,
        predictionType: 'issue-priority',
        priority: ' ',
        reason: '',
        findings: [],
        reviewerSuggestions: [],
      },
    ]);

    expect(aiPredictionRepository.createAll).not.toHaveBeenCalled();
  });

  it('deduplicates and filters invalid source ids before deleting', async () => {
    await service.deleteForSources(
      'github-pull-request',
      [7, 7, 9, Number.NaN],
      'pull-request-merge-risk',
    );

    expect(aiPredictionRepository.deleteAll).toHaveBeenCalledWith({
      sourceType: 'github-pull-request',
      sourceId: {inq: [7, 9]},
      predictionType: 'pull-request-merge-risk',
    });
  });

  it('does nothing when there are no valid source ids to delete', async () => {
    await service.deleteForSources(
      'github-issue',
      [Number.NaN],
      'issue-priority',
    );

    expect(aiPredictionRepository.deleteAll).not.toHaveBeenCalled();
  });

  it('keeps reviewer suggestions even when priority, reason, and findings are empty', async () => {
    aiPredictionRepository.findOne.mockResolvedValue({id: 12});

    await service.syncPrediction({
      sourceType: 'github-pull-request',
      sourceId: 22,
      predictionType: 'pull-request-merge-risk',
      priority: ' ',
      reason: '',
      findings: [],
      reviewerSuggestions: [
        {
          userId: 7,
          username: 'frontend-dev',
          reason: 'Matches the changed UI area.',
        },
      ],
    });

    expect(aiPredictionRepository.updateById).toHaveBeenCalledWith(12, {
      priority: undefined,
      reason: undefined,
      findings: [],
      reviewerSuggestions: [
        {
          userId: 7,
          username: 'frontend-dev',
          reason: 'Matches the changed UI area.',
        },
      ],
    });
  });
});
