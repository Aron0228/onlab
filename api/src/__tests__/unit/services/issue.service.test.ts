import {beforeEach, describe, expect, it, vi} from 'vitest';

import {IssueService} from '../../../services';

describe('IssueService (unit)', () => {
  let githubIssueRepository: {
    deleteAll: ReturnType<typeof vi.fn>;
    deleteById: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    updateById: ReturnType<typeof vi.fn>;
    createAll: ReturnType<typeof vi.fn>;
  };
  let aiPredictionService: {
    syncPrediction: ReturnType<typeof vi.fn>;
    createPredictionsBulk: ReturnType<typeof vi.fn>;
    deleteForSources: ReturnType<typeof vi.fn>;
  };
  let issueAssignmentRepository: {
    deleteAll: ReturnType<typeof vi.fn>;
  };
  let service: IssueService;

  beforeEach(() => {
    githubIssueRepository = {
      deleteAll: vi.fn().mockResolvedValue(undefined),
      deleteById: vi.fn().mockResolvedValue(undefined),
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn(),
      create: vi.fn().mockResolvedValue(undefined),
      updateById: vi.fn().mockResolvedValue(undefined),
      createAll: vi.fn().mockImplementation(async batch =>
        batch.map((issue: object, index: number) => ({
          id: index + 1,
          ...issue,
        })),
      ),
    };
    aiPredictionService = {
      syncPrediction: vi.fn().mockResolvedValue(undefined),
      createPredictionsBulk: vi.fn().mockResolvedValue(undefined),
      deleteForSources: vi.fn().mockResolvedValue(undefined),
    };
    issueAssignmentRepository = {
      deleteAll: vi.fn().mockResolvedValue(undefined),
    };

    service = new IssueService(
      githubIssueRepository as never,
      issueAssignmentRepository as never,
      aiPredictionService as never,
    );
  });

  it('creates an issue when upsert does not find an existing row', async () => {
    githubIssueRepository.findOne.mockResolvedValue(null);
    githubIssueRepository.create.mockResolvedValue({id: 3});

    await service.upsertIssue(
      {
        repositoryId: 1,
        githubId: 2,
        githubIssueNumber: 12,
        title: 'Broken',
        status: 'open',
        description: 'Needs attention',
      },
      {repositoryId: 1, githubId: 2},
    );

    expect(githubIssueRepository.create).toHaveBeenCalledWith({
      repositoryId: 1,
      githubId: 2,
      githubIssueNumber: 12,
      title: 'Broken',
      status: 'open',
      description: 'Needs attention',
    });
    expect(githubIssueRepository.updateById).not.toHaveBeenCalled();
    expect(aiPredictionService.syncPrediction).not.toHaveBeenCalled();
  });

  it('creates a prediction alongside a newly created issue when one is provided', async () => {
    githubIssueRepository.findOne.mockResolvedValue(null);
    githubIssueRepository.create.mockResolvedValue({id: 13});

    await service.upsertIssue(
      {
        repositoryId: 1,
        githubId: 2,
        githubIssueNumber: 12,
        title: 'Broken',
        status: 'open',
        description: 'Needs attention',
      },
      {repositoryId: 1, githubId: 2},
      {
        priority: 'High',
        reason: 'Critical workflow is blocked.',
        estimatedHours: 8,
        estimationConfidence: 'medium',
      },
    );

    expect(aiPredictionService.syncPrediction).toHaveBeenCalledWith({
      sourceType: 'github-issue',
      sourceId: 13,
      predictionType: 'issue-priority',
      priority: 'High',
      reason: 'Critical workflow is blocked.',
      estimatedHours: 8,
      estimationConfidence: 'medium',
    });
  });

  it('updates an issue when upsert finds an existing row', async () => {
    githubIssueRepository.findOne.mockResolvedValue({id: 9});

    await service.upsertIssue(
      {
        repositoryId: 1,
        githubId: 2,
        githubIssueNumber: 12,
        title: 'Broken',
        status: 'closed',
        description: 'Fixed',
      },
      {repositoryId: 1, githubId: 2},
    );

    expect(githubIssueRepository.updateById).toHaveBeenCalledWith(9, {
      repositoryId: 1,
      githubId: 2,
      githubIssueNumber: 12,
      title: 'Broken',
      status: 'closed',
      description: 'Fixed',
    });
    expect(githubIssueRepository.create).not.toHaveBeenCalled();
    expect(aiPredictionService.syncPrediction).not.toHaveBeenCalled();
  });

  it('updates the related prediction when a prediction payload is provided', async () => {
    githubIssueRepository.findOne.mockResolvedValue({id: 9});

    await service.upsertIssue(
      {
        repositoryId: 1,
        githubId: 2,
        githubIssueNumber: 12,
        title: 'Broken',
        status: 'closed',
        description: 'Fixed',
      },
      {repositoryId: 1, githubId: 2},
      {
        priority: 'Low',
        reason: 'Already mitigated.',
        estimatedHours: 1,
        estimationConfidence: 'high',
      },
    );

    expect(aiPredictionService.syncPrediction).toHaveBeenCalledWith({
      sourceType: 'github-issue',
      sourceId: 9,
      predictionType: 'issue-priority',
      priority: 'Low',
      reason: 'Already mitigated.',
      estimatedHours: 1,
      estimationConfidence: 'high',
    });
  });

  it('deletes a single issue by where clause', async () => {
    githubIssueRepository.find.mockResolvedValue([{id: 4}, {id: 8}]);

    await service.deleteOne({repositoryId: 1, githubId: 2});

    expect(aiPredictionService.deleteForSources).toHaveBeenCalledWith(
      'github-issue',
      [4, 8],
      'issue-priority',
    );
    expect(issueAssignmentRepository.deleteAll).toHaveBeenCalledWith({
      issueId: {inq: [4, 8]},
    });
    expect(githubIssueRepository.deleteAll).toHaveBeenCalledWith({
      repositoryId: 1,
      githubId: 2,
    });
  });

  it('deletes repository predictions before deleting repository issues', async () => {
    githubIssueRepository.find.mockResolvedValue([{id: 10}, {id: 20}]);

    await service.deleteByRepositoryId(7);

    expect(aiPredictionService.deleteForSources).toHaveBeenCalledWith(
      'github-issue',
      [10, 20],
      'issue-priority',
    );
    expect(issueAssignmentRepository.deleteAll).toHaveBeenCalledWith({
      issueId: {inq: [10, 20]},
    });
    expect(githubIssueRepository.deleteAll).toHaveBeenCalledWith({
      repositoryId: 7,
    });
  });

  it('deletes a single issue by id through the prediction-aware path', async () => {
    githubIssueRepository.find.mockResolvedValue([{id: 11}]);

    await service.deleteById(11);

    expect(aiPredictionService.deleteForSources).toHaveBeenCalledWith(
      'github-issue',
      [11],
      'issue-priority',
    );
    expect(issueAssignmentRepository.deleteAll).toHaveBeenCalledWith({
      issueId: {inq: [11]},
    });
    expect(githubIssueRepository.deleteAll).toHaveBeenCalledWith({id: 11});
  });

  it('returns the repository delete count when deleting multiple issues', async () => {
    githubIssueRepository.find.mockResolvedValue([{id: 4}, {id: 8}]);
    githubIssueRepository.deleteAll.mockResolvedValue({count: 2});

    await expect(service.deleteAll({repositoryId: 1})).resolves.toEqual({
      count: 2,
    });
    expect(aiPredictionService.deleteForSources).toHaveBeenCalledWith(
      'github-issue',
      [4, 8],
      'issue-priority',
    );
    expect(issueAssignmentRepository.deleteAll).toHaveBeenCalledWith({
      issueId: {inq: [4, 8]},
    });
    expect(githubIssueRepository.deleteAll).toHaveBeenCalledWith({
      repositoryId: 1,
    });
  });

  it('skips associated data cleanup when no issues match deletion', async () => {
    githubIssueRepository.find.mockResolvedValue([]);
    githubIssueRepository.deleteAll.mockResolvedValue({count: 0});

    await expect(service.deleteAll({repositoryId: 99})).resolves.toEqual({
      count: 0,
    });

    expect(aiPredictionService.deleteForSources).not.toHaveBeenCalled();
    expect(issueAssignmentRepository.deleteAll).not.toHaveBeenCalled();
    expect(githubIssueRepository.deleteAll).toHaveBeenCalledWith({
      repositoryId: 99,
    });
  });

  it('saves issues in batches of 100', async () => {
    const issues = Array.from({length: 205}, (_, index) => ({
      issue: {
        repositoryId: 1,
        githubId: index + 1,
        githubIssueNumber: index + 1,
        title: `Issue ${index + 1}`,
        status: 'open',
        description: '',
      },
      prediction: {
        priority: 'Medium',
        reason: `Reason ${index + 1}`,
        estimatedHours: 4,
        estimationConfidence: 'medium' as const,
      },
    }));

    await service.saveIssuesBulk(issues);

    expect(githubIssueRepository.createAll).toHaveBeenCalledTimes(3);
    expect(githubIssueRepository.createAll).toHaveBeenNthCalledWith(
      1,
      issues.slice(0, 100).map(entry => entry.issue),
    );
    expect(githubIssueRepository.createAll).toHaveBeenNthCalledWith(
      2,
      issues.slice(100, 200).map(entry => entry.issue),
    );
    expect(githubIssueRepository.createAll).toHaveBeenNthCalledWith(
      3,
      issues.slice(200, 205).map(entry => entry.issue),
    );
    expect(aiPredictionService.createPredictionsBulk).toHaveBeenCalledTimes(3);
  });
});
