import {beforeEach, describe, expect, it, vi} from 'vitest';

import {Invitation} from '../../../models';
import {InvitationController} from '../../../controllers/system/invitation.controller';
import {createCrudRepositoryMock, describeCrudController} from './test-helpers';

describe('InvitationController (unit)', () => {
  describeCrudController({
    controllerName: 'InvitationController',
    createController: repository =>
      new InvitationController(repository as never),
    id: 23,
    filter: {where: {email: 'aron@example.com'}},
    where: {workspaceId: 11},
    entityFactory: () =>
      new Invitation({
        id: 23,
        email: 'aron@example.com',
        workspaceId: 11,
      }),
    createPayloadFactory: () => ({
      email: 'aron@example.com',
      workspaceId: 11,
    }),
    updatePayloadFactory: () => ({
      email: 'updated@example.com',
    }),
    relationName: 'workspace',
    relationValueFactory: () => ({
      id: 11,
      name: 'Demo Workspace',
    }),
  });

  let repository: ReturnType<typeof createCrudRepositoryMock> & {
    accept: ReturnType<typeof vi.fn>;
  };
  let controller: InvitationController;

  beforeEach(() => {
    repository = {
      ...createCrudRepositoryMock(),
      accept: vi.fn(),
    };
    controller = new InvitationController(repository as never);
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
