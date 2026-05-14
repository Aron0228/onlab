import {Getter} from '@loopback/core';
import {juggler} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {UserProfile} from '@loopback/security';
import {describe, expect, it, vi} from 'vitest';
import {WORKSPACE_MEMBER_ROLE} from '../../constants';
import {Invitation} from '../../models';
import {InvitationRepository} from '../../repositories';
import {profile, workspaceId} from './helpers';

describe('security: invitation acceptance boundary', () => {
  function createRepository({
    currentUser = profile(3),
    userEmail = 'member@example.com',
    invitationEmail = 'member@example.com',
    createMember = vi.fn().mockResolvedValue({id: 44}),
  }: {
    currentUser?: ReturnType<typeof profile> | null;
    userEmail?: string;
    invitationEmail?: string;
    createMember?: ReturnType<typeof vi.fn>;
  } = {}) {
    const dataSource = new juggler.DataSource({
      name: 'db',
      connector: 'memory',
    }) as juggler.DataSource & {
      beginTransaction: ReturnType<typeof vi.fn>;
    };
    const rollback = vi.fn();
    dataSource.beginTransaction = vi.fn().mockResolvedValue({rollback});
    const repository = new InvitationRepository(
      dataSource as never,
      async () => {
        throw new Error('workspace accessor not used');
      },
      async () =>
        ({
          create: createMember,
        }) as never,
      async () =>
        ({
          findById: vi.fn().mockResolvedValue({email: userEmail}),
        }) as never,
      (async () => currentUser ?? undefined) as Getter<UserProfile | undefined>,
    );

    vi.spyOn(repository, 'findById').mockResolvedValue(
      new Invitation({
        id: 9,
        workspaceId,
        email: invitationEmail,
      }),
    );
    vi.spyOn(repository, 'deleteById').mockResolvedValue();

    return {createMember, repository, rollback};
  }

  it('accepts invitations only for the authenticated user email', async () => {
    const {createMember, repository, rollback} = createRepository();

    await expect(repository.accept(9)).resolves.toBeUndefined();

    expect(createMember).toHaveBeenCalledWith({
      userId: 3,
      workspaceId,
      role: WORKSPACE_MEMBER_ROLE.MEMBER,
    });
    expect(repository.deleteById).toHaveBeenCalledWith(9);
    expect(rollback).not.toHaveBeenCalled();
  });

  it('matches invitation email case-insensitively', async () => {
    const {createMember, repository} = createRepository({
      userEmail: 'MEMBER@example.com',
      invitationEmail: 'member@EXAMPLE.com',
    });

    await expect(repository.accept(9)).resolves.toBeUndefined();

    expect(createMember).toHaveBeenCalled();
  });

  it('rejects wrong-email invitation acceptance attempts', async () => {
    const {createMember, repository, rollback} = createRepository({
      userEmail: 'attacker@example.com',
      invitationEmail: 'member@example.com',
    });

    await expect(repository.accept(9)).rejects.toBeInstanceOf(
      HttpErrors.Forbidden,
    );

    expect(createMember).not.toHaveBeenCalled();
    expect(repository.deleteById).not.toHaveBeenCalled();
    expect(rollback).toHaveBeenCalled();
  });

  it('rejects unauthenticated invitation acceptance attempts', async () => {
    const {createMember, repository} = createRepository({
      currentUser: null,
    });

    await expect(repository.accept(9)).rejects.toBeInstanceOf(
      HttpErrors.Unauthorized,
    );

    expect(createMember).not.toHaveBeenCalled();
  });
});
