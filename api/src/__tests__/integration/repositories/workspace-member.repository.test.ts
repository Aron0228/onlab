import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {RestApi} from '../../..';
import {WorkspaceMember} from '../../../models';
import {
  UserRepository,
  WorkspaceMemberRepository,
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

describe('WorkspaceMemberRepository (integration)', () => {
  let app: RestApi;
  let dataSource: Awaited<
    ReturnType<typeof setupRepositoryTestApp>
  >['dataSource'];
  let workspaceMemberRepository: WorkspaceMemberRepository;
  let userRepository: UserRepository;
  let workspaceRepository: WorkspaceRepository;
  let userId: number;
  let workspaceId: number;

  beforeAll(async () => {
    ({app, dataSource} = await setupRepositoryTestApp());
    workspaceMemberRepository =
      await getTestRepository<WorkspaceMemberRepository>(
        app,
        'WorkspaceMemberRepository',
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
    userId = user.id;
    workspaceId = workspace.id;
  });

  afterAll(async () => {
    await teardownRepositoryTestApp(app, dataSource);
  });

  const createWorkspaceMember = () =>
    workspaceMemberRepository.create(
      new WorkspaceMember({
        userId,
        workspaceId,
        role: 'MEMBER',
      }),
    );

  it('creates workspace members', async () => {
    await createWorkspaceMember();

    expect(await workspaceMemberRepository.count()).toEqual({count: 1});
  });

  it('finds workspace members by id', async () => {
    const created = await createWorkspaceMember();

    expect((await workspaceMemberRepository.findById(created.id)).role).toBe(
      'MEMBER',
    );
  });

  it('updates workspace members by id', async () => {
    const created = await createWorkspaceMember();

    await workspaceMemberRepository.updateById(created.id, {role: 'ADMIN'});
    expect((await workspaceMemberRepository.findById(created.id)).role).toBe(
      'ADMIN',
    );
  });

  it('deletes workspace members by id', async () => {
    const created = await createWorkspaceMember();
    await workspaceMemberRepository.deleteById(created.id);

    expect(await workspaceMemberRepository.count()).toEqual({count: 0});
  });

  it('registers user and workspace relations', () => {
    expect(workspaceMemberRepository.inclusionResolvers.has('user')).toBe(true);
    expect(workspaceMemberRepository.inclusionResolvers.has('workspace')).toBe(
      true,
    );
  });
});
