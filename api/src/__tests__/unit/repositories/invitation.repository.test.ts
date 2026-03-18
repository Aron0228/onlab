import {beforeEach, describe, expect, it, vi} from 'vitest';
import {juggler} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';

import {Invitation, User, Workspace} from '../../../models';
import {InvitationRepository} from '../../../repositories';
import {WORKSPACE_MEMBER_ROLE} from '../../../constants';
import {
  buildSystemRepositories,
  createMemoryDataSource,
  givenCurrentUser,
} from './test-helpers';

describe('InvitationRepository (unit)', () => {
  let dataSource: juggler.DataSource;
  let invitationRepository: ReturnType<
    typeof buildSystemRepositories
  >['invitationRepository'];
  let workspaceId: number;

  beforeEach(async () => {
    dataSource = createMemoryDataSource();
    const repositories = buildSystemRepositories(dataSource);
    invitationRepository = repositories.invitationRepository;
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
    workspaceId = workspace.id;
  });

  const createInvitation = () =>
    invitationRepository.create(
      new Invitation({
        email: 'invitee@example.com',
        workspaceId,
      }),
    );

  it('creates invitations', async () => {
    await createInvitation();

    expect(await invitationRepository.count()).toEqual({count: 1});
  });

  it('finds invitations by id', async () => {
    const created = await createInvitation();

    expect((await invitationRepository.findById(created.id)).email).toBe(
      'invitee@example.com',
    );
  });

  it('updates invitations by id', async () => {
    const created = await createInvitation();

    await invitationRepository.updateById(created.id, {
      email: 'updated@example.com',
    });
    expect((await invitationRepository.findById(created.id)).email).toBe(
      'updated@example.com',
    );
  });

  it('deletes invitations by id', async () => {
    const created = await createInvitation();
    await invitationRepository.deleteById(created.id);

    expect(await invitationRepository.count()).toEqual({count: 0});
  });

  it('registers the workspace relation', () => {
    const {invitationRepository} = buildSystemRepositories(dataSource);

    expect(invitationRepository.inclusionResolvers.has('workspace')).toBe(true);
  });

  it('creates a workspace member and deletes the invitation on accept', async () => {
    const workspaceMemberRepository = {
      create: vi.fn(),
    };
    const repository = new InvitationRepository(
      dataSource as never,
      async () => {
        throw new Error('workspace accessor not used');
      },
      async () => workspaceMemberRepository as never,
      async () => givenCurrentUser(42),
    );
    const rollback = vi.fn();

    vi.spyOn(repository, 'findById').mockResolvedValue(
      new Invitation({
        id: 9,
        workspaceId: 15,
        email: 'invitee@example.com',
      }),
    );
    vi.spyOn(repository, 'deleteById').mockResolvedValue();
    (
      repository.dataSource as unknown as {
        beginTransaction: ReturnType<typeof vi.fn>;
      }
    ).beginTransaction = vi.fn().mockResolvedValue({rollback});

    await repository.accept(9);

    expect(workspaceMemberRepository.create).toHaveBeenCalledWith({
      userId: 42,
      workspaceId: 15,
      role: WORKSPACE_MEMBER_ROLE.MEMBER,
    });
    expect(repository.deleteById).toHaveBeenCalledWith(9);
    expect(rollback).not.toHaveBeenCalled();
  });

  it('rejects anonymous users', async () => {
    const repository = new InvitationRepository(
      dataSource as never,
      async () => {
        throw new Error('workspace accessor not used');
      },
      async () => ({create: vi.fn()}) as never,
      async () => undefined,
    );

    await expect(repository.accept(1)).rejects.toThrowError(
      new HttpErrors.Unauthorized('Unauthorized'),
    );
  });

  it('rolls back and wraps failures during accept', async () => {
    const rollback = vi.fn();
    const repository = new InvitationRepository(
      dataSource as never,
      async () => {
        throw new Error('workspace accessor not used');
      },
      async () =>
        ({
          create: vi.fn().mockRejectedValue(new Error('create failed')),
        }) as never,
      async () => givenCurrentUser(42),
    );

    vi.spyOn(repository, 'findById').mockResolvedValue(
      new Invitation({
        id: 9,
        workspaceId: 15,
        email: 'invitee@example.com',
      }),
    );
    (
      repository.dataSource as unknown as {
        beginTransaction: ReturnType<typeof vi.fn>;
      }
    ).beginTransaction = vi.fn().mockResolvedValue({rollback});

    await expect(repository.accept(9)).rejects.toThrowError(
      new HttpErrors.InternalServerError('create failed'),
    );
    expect(rollback).toHaveBeenCalled();
  });
});
