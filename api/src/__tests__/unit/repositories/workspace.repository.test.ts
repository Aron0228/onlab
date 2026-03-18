import {beforeEach, describe, expect, it} from 'vitest';
import {juggler} from '@loopback/repository';

import {User, Workspace} from '../../../models';
import {buildSystemRepositories, createMemoryDataSource} from './test-helpers';

describe('WorkspaceRepository (unit)', () => {
  let dataSource: juggler.DataSource;
  let workspaceRepository: ReturnType<
    typeof buildSystemRepositories
  >['workspaceRepository'];
  let userId: number;

  beforeEach(async () => {
    dataSource = createMemoryDataSource();
    const repositories = buildSystemRepositories(dataSource);
    workspaceRepository = repositories.workspaceRepository;
    const {userRepository} = repositories;
    const user = await userRepository.create(
      new User({
        githubId: 1,
        username: 'aron0228',
        fullName: 'Reszegi Aron',
        email: 'aron@example.com',
        avatarUrl: 'https://example.com/avatar.png',
      }),
    );
    userId = user.id;
  });

  const createWorkspace = () =>
    workspaceRepository.create(
      new Workspace({
        name: 'Demo Workspace',
        ownerId: userId,
      }),
    );

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
    const {workspaceRepository} = buildSystemRepositories(dataSource);

    expect(workspaceRepository.inclusionResolvers.has('owner')).toBe(true);
    expect(workspaceRepository.inclusionResolvers.has('files')).toBe(true);
    expect(workspaceRepository.inclusionResolvers.has('invitations')).toBe(
      true,
    );
  });
});
