import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {RestApi} from '../../..';
import {GithubLabel, GithubRepository} from '../../../models';
import {
  GithubLabelRepository,
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

describe('GithubLabelRepository (integration)', () => {
  let app: RestApi;
  let dataSource: Awaited<
    ReturnType<typeof setupRepositoryTestApp>
  >['dataSource'];
  let githubLabelRepository: GithubLabelRepository;
  let githubRepositoryRepository: GithubRepositoryRepository;
  let userRepository: UserRepository;
  let workspaceRepository: WorkspaceRepository;
  let workspaceId: number;

  beforeAll(async () => {
    ({app, dataSource} = await setupRepositoryTestApp());
    githubLabelRepository = await getTestRepository<GithubLabelRepository>(
      app,
      'GithubLabelRepository',
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

  it('creates labels linked to a repository', async () => {
    const repository = await githubRepositoryRepository.create(
      new GithubRepository({
        workspaceId,
        githubRepoId: 123,
        name: 'api',
        fullName: 'team/api',
      }),
    );

    await githubLabelRepository.create(
      new GithubLabel({
        repositoryId: repository.id,
        githubLabelId: 444,
        name: 'Priority: Medium',
        color: 'eab308',
      }),
    );

    expect(await githubLabelRepository.count()).toEqual({count: 1});
  });

  it('registers the repository relation', () => {
    expect(githubLabelRepository.inclusionResolvers.has('repository')).toBe(
      true,
    );
  });
});
