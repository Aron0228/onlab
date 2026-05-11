import {beforeEach, describe, expect, it, vi} from 'vitest';

import {InvitationController} from '../../../controllers/system/invitation.controller';
import {Invitation} from '../../../models';

describe('InvitationController (unit)', () => {
  let repository: {
    find: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    accept: ReturnType<typeof vi.fn>;
  };
  let authorization: {
    getAuthenticatedUserId: ReturnType<typeof vi.fn>;
    accessibleWorkspaceIds: ReturnType<typeof vi.fn>;
    assertWorkspaceMember: ReturnType<typeof vi.fn>;
    assertWorkspaceAdminOrOwner: ReturnType<typeof vi.fn>;
  };
  let controller: InvitationController;

  beforeEach(() => {
    repository = {
      find: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      accept: vi.fn(),
    };
    authorization = {
      getAuthenticatedUserId: vi.fn().mockReturnValue(7),
      accessibleWorkspaceIds: vi.fn().mockResolvedValue([11]),
      assertWorkspaceMember: vi.fn().mockResolvedValue('MEMBER'),
      assertWorkspaceAdminOrOwner: vi.fn().mockResolvedValue('ADMIN'),
    };
    controller = new InvitationController(
      repository as never,
      authorization as never,
    );
  });

  it('scopes invitation lists to accessible workspaces', async () => {
    const invitation = new Invitation({
      id: 23,
      email: 'aron@example.com',
      workspaceId: 11,
    });
    repository.find.mockResolvedValue([invitation]);

    await expect(
      controller.find({id: 7} as never, {where: {email: 'aron@example.com'}}),
    ).resolves.toEqual([invitation]);

    expect(repository.find).toHaveBeenCalledWith({
      where: {
        and: [{email: 'aron@example.com'}, {workspaceId: {inq: [11]}}],
      },
    });
  });

  it('requires admin or owner permission when creating invitations', async () => {
    const invitation = new Invitation({
      id: 23,
      email: 'aron@example.com',
      workspaceId: 11,
    });
    repository.create.mockResolvedValue(invitation);

    await expect(
      controller.create({id: 7} as never, {
        email: 'aron@example.com',
        workspaceId: 11,
      }),
    ).resolves.toBe(invitation);

    expect(authorization.assertWorkspaceAdminOrOwner).toHaveBeenCalledWith(
      11,
      7,
    );
  });

  it('accepts invitations by id', async () => {
    const accepted = {workspaceMemberId: 33};
    repository.accept.mockResolvedValue(accepted);

    await expect(controller.accept({invitationId: 23})).resolves.toEqual(
      accepted,
    );
    expect(repository.accept).toHaveBeenCalledWith(23);
  });
});
