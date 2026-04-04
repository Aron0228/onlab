import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {RestApi} from '../../..';
import {
  AIPrediction,
  GithubIssue,
  GithubPullRequest,
  GithubRepository,
} from '../../../models';
import {
  AIPredictionRepository,
  GithubIssueRepository,
  GithubPullRequestRepository,
  GithubRepositoryRepository,
  UserRepository,
  WorkspaceRepository,
} from '../../../repositories';
import {
  createTestUser,
  createTestWorkspace,
  getTestRepository,
  resetTestDataSource,
  setupRepositoryTestApp,
  teardownRepositoryTestApp,
} from './test-helpers';

describe('AIPredictionRepository (integration)', () => {
  let app: RestApi;
  let dataSource: Awaited<
    ReturnType<typeof setupRepositoryTestApp>
  >['dataSource'];
  let aiPredictionRepository: AIPredictionRepository;
  let githubIssueRepository: GithubIssueRepository;
  let githubPullRequestRepository: GithubPullRequestRepository;
  let githubRepositoryRepository: GithubRepositoryRepository;
  let userRepository: UserRepository;
  let workspaceRepository: WorkspaceRepository;
  let workspaceId: number;

  beforeAll(async () => {
    ({app, dataSource} = await setupRepositoryTestApp());
    aiPredictionRepository = await getTestRepository<AIPredictionRepository>(
      app,
      'AIPredictionRepository',
    );
    githubIssueRepository = await getTestRepository<GithubIssueRepository>(
      app,
      'GithubIssueRepository',
    );
    githubPullRequestRepository =
      await getTestRepository<GithubPullRequestRepository>(
        app,
        'GithubPullRequestRepository',
      );
    githubRepositoryRepository =
      await getTestRepository<GithubRepositoryRepository>(
        app,
        'GithubRepositoryRepository',
      );
    userRepository = await getTestRepository<UserRepository>(
      app,
      'UserRepository',
    );
    workspaceRepository = await getTestRepository<WorkspaceRepository>(
      app,
      'WorkspaceRepository',
    );
  });

  beforeEach(async () => {
    await resetTestDataSource(dataSource);

    const user = await createTestUser(userRepository);
    const workspace = await createTestWorkspace(workspaceRepository, user.id);

    workspaceId = workspace.id;
  });

  afterAll(async () => {
    await teardownRepositoryTestApp(app, dataSource);
  });

  it('creates AI predictions in the system schema', async () => {
    await aiPredictionRepository.create(
      new AIPrediction({
        sourceType: 'github-issue',
        sourceId: 12,
        predictionType: 'issue-priority',
        priority: 'High',
        reason: 'Core workflow is blocked.',
      }),
    );

    expect(await aiPredictionRepository.count()).toEqual({count: 1});
  });

  it('registers AI prediction inclusion resolvers for issues and pull requests', async () => {
    const repository = await githubRepositoryRepository.create(
      new GithubRepository({
        workspaceId,
        githubRepoId: 123,
        name: 'api',
        fullName: 'team/api',
      }),
    );
    const issue = await githubIssueRepository.create(
      new GithubIssue({
        repositoryId: repository.id,
        githubId: 456,
        githubIssueNumber: 8,
        title: 'Broken issue',
        status: 'open',
        description: 'Needs attention',
      }),
    );
    const pullRequest = await githubPullRequestRepository.create(
      new GithubPullRequest({
        repositoryId: repository.id,
        githubPrNumber: 13,
        title: 'Risky change',
        status: 'open',
        description: 'Touches auth',
      }),
    );
    await aiPredictionRepository.create(
      new AIPrediction({
        sourceType: 'github-issue',
        sourceId: issue.id,
        predictionType: 'issue-priority',
        priority: 'High',
        reason: 'Issue affects sign-in.',
      }),
    );
    await aiPredictionRepository.create(
      new AIPrediction({
        sourceType: 'github-pull-request',
        sourceId: pullRequest.id,
        predictionType: 'pull-request-merge-risk',
        priority: 'Medium',
        reason: 'Shared auth flow changed.',
      }),
    );

    const hydratedIssue = await githubIssueRepository.findById(issue.id, {
      include: ['aiPrediction'],
    });
    const hydratedPullRequest = await githubPullRequestRepository.findById(
      pullRequest.id,
      {
        include: ['aiPrediction'],
      },
    );

    expect(githubIssueRepository.inclusionResolvers.has('aiPrediction')).toBe(
      true,
    );
    expect(
      githubPullRequestRepository.inclusionResolvers.has('aiPrediction'),
    ).toBe(true);
    expect(hydratedIssue.aiPrediction?.priority).toBe('High');
    expect(hydratedPullRequest.aiPrediction?.priority).toBe('Medium');
  });
});
