import {describe, expect, it} from 'vitest';

import {
  AI_ESTIMATION_CONFIDENCE_VALUES,
  AIPredictable,
  AIPrediction,
  AI_PREDICTION_SOURCE_TYPES,
  AI_PREDICTION_TYPES,
  GithubIssue,
  GithubPullRequest,
} from '../../../models';

describe('AI prediction models (unit)', () => {
  it('defines the supported prediction source and type values', () => {
    expect(AI_PREDICTION_SOURCE_TYPES).toEqual([
      'github-issue',
      'github-pull-request',
    ]);
    expect(AI_PREDICTION_TYPES).toEqual([
      'issue-priority',
      'pull-request-merge-risk',
    ]);
    expect(AI_ESTIMATION_CONFIDENCE_VALUES).toEqual(['low', 'medium', 'high']);
  });

  it('constructs AI prediction entities with provided values', () => {
    const model = new AIPrediction({
      sourceType: 'github-issue',
      sourceId: 5,
      predictionType: 'issue-priority',
      priority: 'High',
      reason: 'Critical workflow is blocked.',
      estimatedHours: 8,
      estimationConfidence: 'medium',
    });

    expect(model.sourceType).toBe('github-issue');
    expect(model.sourceId).toBe(5);
    expect(model.predictionType).toBe('issue-priority');
    expect(model.priority).toBe('High');
    expect(model.reason).toBe('Critical workflow is blocked.');
    expect(model.estimatedHours).toBe(8);
    expect(model.estimationConfidence).toBe('medium');
  });

  it('lets GitHub issue and pull request models inherit from AI predictable', () => {
    expect(new GithubIssue()).toBeInstanceOf(AIPredictable);
    expect(new GithubPullRequest()).toBeInstanceOf(AIPredictable);
  });
});
