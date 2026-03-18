import {beforeEach, describe, expect, it} from 'vitest';
import {juggler} from '@loopback/repository';

import {User, Workspace, WorkspaceMember} from '../../../models';
import {buildSystemRepositories, createMemoryDataSource} from './test-helpers';

describe('WorkspaceMemberRepository (unit)', () => {
  let dataSource: juggler.DataSource;
  let workspaceMemberRepository: ReturnType<
    typeof buildSystemRepositories
  >['workspaceMemberRepository'];
  let userId: number;
  let workspaceId: number;

  beforeEach(async () => {
    dataSource = createMemoryDataSource();
    const repositories = buildSystemRepositories(dataSource);
    workspaceMemberRepository = repositories.workspaceMemberRepository;
    const {userRepository, workspaceRepository} = repositories;
    const user = await userRepository.create(
      new User({
        githubId: 1,
        username: 'aron0228',
        fullName: 'Reszegi Aron',
        email: 'aron@example.com',
        avatarUrl: 'https://example.com/avatar.png',
      }),
    );
    const workspace = await workspaceRepository.create(
      new Workspace({
        name: 'Demo Workspace',
        ownerId: user.id,
      }),
    );
    userId = user.id;
    workspaceId = workspace.id;
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
    const {workspaceMemberRepository} = buildSystemRepositories(dataSource);

    expect(workspaceMemberRepository.inclusionResolvers.has('user')).toBe(true);
    expect(workspaceMemberRepository.inclusionResolvers.has('workspace')).toBe(
      true,
    );
  });
});
