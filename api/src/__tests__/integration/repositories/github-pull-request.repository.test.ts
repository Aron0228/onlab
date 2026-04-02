import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {RestApi} from '../../..';
import {GithubPullRequest, GithubRepository} from '../../../models';
import {
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

describe('GithubPullRequestRepository (integration)', () => {
  let app: RestApi;
  let dataSource: Awaited<
    ReturnType<typeof setupRepositoryTestApp>
  >['dataSource'];
  let githubPullRequestRepository: GithubPullRequestRepository;
  let githubRepositoryRepository: GithubRepositoryRepository;
  let userRepository: UserRepository;
  let workspaceRepository: WorkspaceRepository;
  let workspaceId: number;
  let userId: number;

  beforeAll(async () => {
    ({app, dataSource} = await setupRepositoryTestApp());
    userRepository = await getTestRepository<UserRepository>(
      app,
      'UserRepository',
    );
    workspaceRepository = await getTestRepository<WorkspaceRepository>(
      app,
      'WorkspaceRepository',
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
  });

  beforeEach(async () => {
    await resetTestDataSource(dataSource);

    const user = await createTestUser(userRepository);
    userId = user.id;

    const workspace = await createTestWorkspace(workspaceRepository, userId);
    workspaceId = workspace.id;
  });

  afterAll(async () => {
    await teardownRepositoryTestApp(app, dataSource);
  });

  it('creates pull requests with nullable author ids', async () => {
    const repository = await githubRepositoryRepository.create(
      new GithubRepository({
        workspaceId,
        githubRepoId: 123,
        name: 'api',
        fullName: 'team/api',
      }),
    );

    await githubPullRequestRepository.create(
      new GithubPullRequest({
        repositoryId: repository.id,
        githubPrNumber: 41,
        title: 'Add feature',
        status: 'open',
        description: '',
        authorId: null,
      }),
    );

    await githubPullRequestRepository.create(
      new GithubPullRequest({
        repositoryId: repository.id,
        githubPrNumber: 42,
        title: 'Fix bug',
        status: 'merged',
        description: 'Done',
        authorId: userId,
      }),
    );

    expect(await githubPullRequestRepository.count()).toEqual({count: 2});
  });

  it('registers repository and author relations', () => {
    expect(
      githubPullRequestRepository.inclusionResolvers.has('repository'),
    ).toBe(true);
    expect(githubPullRequestRepository.inclusionResolvers.has('author')).toBe(
      true,
    );
  });
});
