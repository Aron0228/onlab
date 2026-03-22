import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {RestApi} from '../../..';
import {UserRepository, WorkspaceRepository} from '../../../repositories';
import {
  createTestUser,
  createTestWorkspace,
  getTestRepository,
  resetTestDataSource,
  setupRepositoryTestApp,
  teardownRepositoryTestApp,
} from './test-helpers';

describe('WorkspaceRepository (integration)', () => {
  let app: RestApi;
  let dataSource: Awaited<
    ReturnType<typeof setupRepositoryTestApp>
  >['dataSource'];
  let workspaceRepository: WorkspaceRepository;
  let userRepository: UserRepository;
  let userId: number;

  beforeAll(async () => {
    ({app, dataSource} = await setupRepositoryTestApp());
    workspaceRepository = await getTestRepository<WorkspaceRepository>(
      app,
      'WorkspaceRepository',
    );
    userRepository = await getTestRepository<UserRepository>(
      app,
      'UserRepository',
    );
  });

  beforeEach(async () => {
    await resetTestDataSource(dataSource);
    const user = await createTestUser(userRepository);
    userId = user.id;
  });

  afterAll(async () => {
    await teardownRepositoryTestApp(app, dataSource);
  });

  const createWorkspace = () => createTestWorkspace(workspaceRepository, userId);

  it('creates workspaces', async () => {
    await createWorkspace();

    expect(await workspaceRepository.count()).toEqual({count: 1});
  });

  it('finds workspaces by id', async () => {
    const created = await createWorkspace();

    expect((await workspaceRepository.findById(created.id)).name).toBe(
      'Demo Workspace',
    );
  });

  it('updates workspaces by id', async () => {
    const created = await createWorkspace();

    await workspaceRepository.updateById(created.id, {
      name: 'Updated Workspace',
    });
    expect((await workspaceRepository.findById(created.id)).name).toBe(
      'Updated Workspace',
    );
  });

  it('deletes workspaces by id', async () => {
    const created = await createWorkspace();
    await workspaceRepository.deleteById(created.id);

    expect(await workspaceRepository.count()).toEqual({count: 0});
  });

  it('registers owner, files, and invitations relations', () => {
    expect(workspaceRepository.inclusionResolvers.has('owner')).toBe(true);
    expect(workspaceRepository.inclusionResolvers.has('files')).toBe(true);
    expect(workspaceRepository.inclusionResolvers.has('invitations')).toBe(
      true,
    );
  });
});
