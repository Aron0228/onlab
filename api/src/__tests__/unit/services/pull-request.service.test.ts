import {beforeEach, describe, expect, it, vi} from 'vitest';

import {PullRequestService} from '../../../services';

describe('PullRequestService (unit)', () => {
  let githubPullRequestRepository: {
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
  let service: PullRequestService;

  beforeEach(() => {
    githubPullRequestRepository = {
      deleteAll: vi.fn().mockResolvedValue(undefined),
      deleteById: vi.fn().mockResolvedValue(undefined),
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn(),
      create: vi.fn().mockImplementation(async pullRequest => ({
        id: 1,
        ...pullRequest,
      })),
      updateById: vi.fn().mockResolvedValue(undefined),
      createAll: vi.fn().mockImplementation(async batch =>
        batch.map((pullRequest: object, index: number) => ({
          id: index + 1,
          ...pullRequest,
        })),
      ),
    };
    aiPredictionService = {
      syncPrediction: vi.fn().mockResolvedValue(undefined),
      createPredictionsBulk: vi.fn().mockResolvedValue(undefined),
      deleteForSources: vi.fn().mockResolvedValue(undefined),
    };

    service = new PullRequestService(
      githubPullRequestRepository as never,
      aiPredictionService as never,
    );
  });

  it('creates a pull request when upsert does not find an existing row', async () => {
    githubPullRequestRepository.findOne.mockResolvedValue(null);

    await service.upsertPullRequest(
      {
        repositoryId: 1,
        githubPrNumber: 7,
        title: 'Ship it',
        status: 'open',
        description: 'Ready',
        authorId: 3,
      },
      {repositoryId: 1, githubPrNumber: 7},
    );

    expect(githubPullRequestRepository.create).toHaveBeenCalledWith({
      repositoryId: 1,
      githubPrNumber: 7,
      title: 'Ship it',
      status: 'open',
      description: 'Ready',
      authorId: 3,
    });
    expect(githubPullRequestRepository.updateById).not.toHaveBeenCalled();
    expect(aiPredictionService.syncPrediction).not.toHaveBeenCalled();
  });

  it('creates a prediction alongside a pull request when prediction details are provided', async () => {
    githubPullRequestRepository.findOne.mockResolvedValue(null);

    await service.upsertPullRequest(
      {
        repositoryId: 1,
        githubPrNumber: 7,
        title: 'Ship it',
        status: 'open',
        description: 'Ready',
        authorId: 3,
      },
      {repositoryId: 1, githubPrNumber: 7},
      {
        priority: 'Very-High',
        reason: 'Touches auth and migrations.',
        findings: [
          {
            path: 'src/auth.ts',
            line: 42,
            body: 'Guard condition was removed.',
          },
        ],
        reviewerSuggestions: [
          {
            userId: 8,
            username: 'platform-owner',
            reason: 'Owns auth and migration reviews.',
          },
        ],
      },
    );

    expect(aiPredictionService.syncPrediction).toHaveBeenLastCalledWith({
      sourceType: 'github-pull-request',
      sourceId: 1,
      predictionType: 'pull-request-merge-risk',
      priority: 'Very-High',
      reason: 'Touches auth and migrations.',
      findings: [
        {
          path: 'src/auth.ts',
          line: 42,
          body: 'Guard condition was removed.',
        },
      ],
      reviewerSuggestions: [
        {
          userId: 8,
          username: 'platform-owner',
          reason: 'Owns auth and migration reviews.',
        },
      ],
    });
  });

  it('finds a pull request by where clause', async () => {
    const existingPullRequest = {id: 4, githubPrNumber: 7};
    githubPullRequestRepository.findOne.mockResolvedValue(existingPullRequest);

    await expect(
      service.findOne({repositoryId: 1, githubPrNumber: 7}),
    ).resolves.toEqual(existingPullRequest);
    expect(githubPullRequestRepository.findOne).toHaveBeenCalledWith({
      where: {repositoryId: 1, githubPrNumber: 7},
    });
  });

  it('updates a pull request when upsert finds an existing row', async () => {
    githubPullRequestRepository.findOne.mockResolvedValue({id: 4});

    await service.upsertPullRequest(
      {
        repositoryId: 1,
        githubPrNumber: 7,
        title: 'Ship it',
        status: 'merged',
        description: 'Done',
        authorId: null,
      },
      {repositoryId: 1, githubPrNumber: 7},
    );

    expect(githubPullRequestRepository.updateById).toHaveBeenCalledWith(4, {
      repositoryId: 1,
      githubPrNumber: 7,
      title: 'Ship it',
      status: 'merged',
      description: 'Done',
      authorId: null,
    });
    expect(githubPullRequestRepository.create).not.toHaveBeenCalled();
    expect(aiPredictionService.syncPrediction).not.toHaveBeenCalled();
  });

  it('updates the related prediction only when a prediction payload is provided', async () => {
    githubPullRequestRepository.findOne.mockResolvedValue({id: 4});

    await service.upsertPullRequest(
      {
        repositoryId: 1,
        githubPrNumber: 7,
        title: 'Ship it',
        status: 'merged',
        description: 'Done',
        authorId: null,
      },
      {repositoryId: 1, githubPrNumber: 7},
      {
        priority: 'Medium',
        reason: 'Touches shared code paths.',
        findings: [],
        reviewerSuggestions: [
          {
            userId: 10,
            username: 'shared-owner',
            reason: 'Knows the shared code path.',
          },
        ],
      },
    );

    expect(aiPredictionService.syncPrediction).toHaveBeenCalledWith({
      sourceType: 'github-pull-request',
      sourceId: 4,
      predictionType: 'pull-request-merge-risk',
      priority: 'Medium',
      reason: 'Touches shared code paths.',
      findings: [],
      reviewerSuggestions: [
        {
          userId: 10,
          username: 'shared-owner',
          reason: 'Knows the shared code path.',
        },
      ],
    });
  });

  it('deletes a single pull request by where clause', async () => {
    githubPullRequestRepository.find.mockResolvedValue([{id: 4}, {id: 5}]);

    await service.deleteOne({repositoryId: 1, githubPrNumber: 7});

    expect(aiPredictionService.deleteForSources).toHaveBeenCalledWith(
      'github-pull-request',
      [4, 5],
      'pull-request-merge-risk',
    );
    expect(githubPullRequestRepository.deleteAll).toHaveBeenCalledWith({
      repositoryId: 1,
      githubPrNumber: 7,
    });
  });

  it('deletes repository predictions before deleting repository pull requests', async () => {
    githubPullRequestRepository.find.mockResolvedValue([{id: 10}, {id: 20}]);

    await service.deleteByRepositoryId(3);

    expect(aiPredictionService.deleteForSources).toHaveBeenCalledWith(
      'github-pull-request',
      [10, 20],
      'pull-request-merge-risk',
    );
    expect(githubPullRequestRepository.deleteAll).toHaveBeenCalledWith({
      repositoryId: 3,
    });
  });

  it('deletes a single pull request by id through the prediction-aware path', async () => {
    githubPullRequestRepository.find.mockResolvedValue([{id: 21}]);

    await service.deleteById(21);

    expect(aiPredictionService.deleteForSources).toHaveBeenCalledWith(
      'github-pull-request',
      [21],
      'pull-request-merge-risk',
    );
    expect(githubPullRequestRepository.deleteAll).toHaveBeenCalledWith({
      id: 21,
    });
  });

  it('returns the repository delete count when deleting multiple pull requests', async () => {
    githubPullRequestRepository.find.mockResolvedValue([{id: 4}, {id: 5}]);
    githubPullRequestRepository.deleteAll.mockResolvedValue({count: 2});

    await expect(service.deleteAll({repositoryId: 1})).resolves.toEqual({
      count: 2,
    });
    expect(aiPredictionService.deleteForSources).toHaveBeenCalledWith(
      'github-pull-request',
      [4, 5],
      'pull-request-merge-risk',
    );
    expect(githubPullRequestRepository.deleteAll).toHaveBeenCalledWith({
      repositoryId: 1,
    });
  });

  it('saves pull requests in batches of 100', async () => {
    const pullRequests = Array.from({length: 205}, (_, index) => ({
      pullRequest: {
        repositoryId: 1,
        githubPrNumber: index + 1,
        title: `PR ${index + 1}`,
        status: 'open',
        description: '',
        authorId: null,
      },
      prediction: {
        priority: 'High',
        reason: `Reason ${index + 1}`,
        findings: [],
      },
    }));

    await service.savePullRequestsBulk(pullRequests);

    expect(githubPullRequestRepository.createAll).toHaveBeenCalledTimes(3);
    expect(githubPullRequestRepository.createAll).toHaveBeenNthCalledWith(
      1,
      pullRequests.slice(0, 100).map(entry => entry.pullRequest),
    );
    expect(githubPullRequestRepository.createAll).toHaveBeenNthCalledWith(
      2,
      pullRequests.slice(100, 200).map(entry => entry.pullRequest),
    );
    expect(githubPullRequestRepository.createAll).toHaveBeenNthCalledWith(
      3,
      pullRequests.slice(200, 205).map(entry => entry.pullRequest),
    );
    expect(aiPredictionService.createPredictionsBulk).toHaveBeenCalledTimes(3);
  });
});
