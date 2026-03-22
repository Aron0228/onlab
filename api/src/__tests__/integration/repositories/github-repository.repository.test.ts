import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {RestApi} from '../../..';
import {
  GithubIssue,
  GithubLabel,
  GithubPullRequest,
  GithubRepository,
} from '../../../models';
import {
  GithubIssueRepository,
  GithubLabelRepository,
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

describe('GithubRepositoryRepository (integration)', () => {
  let app: RestApi;
  let githubIssueRepository: GithubIssueRepository;
  let githubLabelRepository: GithubLabelRepository;
  let githubPullRequestRepository: GithubPullRequestRepository;
  let githubRepositoryRepository: GithubRepositoryRepository;
  let dataSource: Awaited<
    ReturnType<typeof setupRepositoryTestApp>
  >['dataSource'];
  let userRepository: UserRepository;
  let workspaceRepository: WorkspaceRepository;
  let workspaceId: number;

  beforeAll(async () => {
    ({app, dataSource} = await setupRepositoryTestApp());
    githubIssueRepository = await getTestRepository<GithubIssueRepository>(
      app,
      'GithubIssueRepository',
    );
    githubLabelRepository = await getTestRepository<GithubLabelRepository>(
      app,
      'GithubLabelRepository',
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

  it('deleteCascade deletes repository issues, labels, and pull requests before deleting the repository', async () => {
    const repository = await githubRepositoryRepository.create(
      new GithubRepository({
        workspaceId,
        githubRepoId: 123,
        name: 'onlab',
        fullName: 'aron0228/onlab',
      }),
    );

    await githubIssueRepository.create(
      new GithubIssue({
        repositoryId: repository.id,
        githubId: 456,
        githubIssueNumber: 12,
        title: 'Issue 1',
        status: 'open',
        description: 'Needs attention',
      }),
    );
    await githubPullRequestRepository.create(
      new GithubPullRequest({
        repositoryId: repository.id,
        githubPrNumber: 21,
        title: 'PR 1',
        status: 'merged',
        description: 'Fixes issue',
      }),
    );
    await githubLabelRepository.create(
      new GithubLabel({
        repositoryId: repository.id,
        githubLabelId: 5001,
        name: 'Priority: High',
        color: 'f97316',
      }),
    );

    await githubRepositoryRepository.deleteCascade(repository.id);

    expect(await githubIssueRepository.count()).toEqual({count: 0});
    expect(await githubLabelRepository.count()).toEqual({count: 0});
    expect(await githubPullRequestRepository.count()).toEqual({count: 0});
    expect(await githubRepositoryRepository.count()).toEqual({count: 0});
  });

  it('allows saving blank descriptions for GitHub issues and pull requests', async () => {
    const repository = await githubRepositoryRepository.create(
      new GithubRepository({
        workspaceId,
        githubRepoId: 456,
        name: 'api',
        fullName: 'aron0228/api',
      }),
    );

    const issue = await githubIssueRepository.create(
      new GithubIssue({
        repositoryId: repository.id,
        githubId: 789,
        githubIssueNumber: 33,
        title: 'Issue without body',
        status: 'closed',
        description: '',
      }),
    );
    const pullRequest = await githubPullRequestRepository.create(
      new GithubPullRequest({
        repositoryId: repository.id,
        githubPrNumber: 44,
        title: 'PR without body',
        status: 'open',
        description: '',
      }),
    );

    expect(issue.description).toBe('');
    expect(pullRequest.description).toBe('');
  });
});
