import {beforeEach, describe, expect, it, vi} from 'vitest';
import {IssuePriorityService} from '../../../services';

describe('IssuePriorityService (unit)', () => {
  let ollamaService: {
    chatJson: ReturnType<typeof vi.fn>;
  };
  let service: IssuePriorityService;

  beforeEach(() => {
    ollamaService = {
      chatJson: vi.fn(),
    };

    service = new IssuePriorityService(ollamaService as never);
  });

  it('normalizes the model response into a valid prediction', async () => {
    ollamaService.chatJson.mockResolvedValue({
      priority: 'veryhigh',
      reason: 'Authentication bypass is explicitly confirmed.',
    });

    await expect(
      service.predictIssuePriority({
        title: 'Login bypass',
        description: 'Users can access admin routes without authentication.',
      }),
    ).resolves.toEqual({
      priority: 'Very-High',
      reason: 'Authentication bypass is explicitly confirmed.',
    });
  });

  it('removes the previous AI note before appending a new one', () => {
    const withNote = service.upsertPredictionNote('Original description', {
      priority: 'High',
      reason: 'The billing module is unusable.',
    });

    const updated = service.upsertPredictionNote(withNote, {
      priority: 'Medium',
      reason: 'Only one feature is broken.',
    });

    expect(updated).toContain('Original description');
    expect(updated).toContain('AI priority prediction: Medium');
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
    });
  });
});
