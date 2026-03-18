import {describe, expect, it} from 'vitest';

import {User} from '../../../models';
import {UserController} from '../../../controllers/auth/user.controller';
import {describeCrudController} from './test-helpers';

describe('UserController (unit)', () => {
  describeCrudController({
    controllerName: 'UserController',
    createController: repository => new UserController(repository as never),
    id: 7,
    filter: {where: {username: 'aron0228'}},
    where: {githubId: 1},
    entityFactory: () =>
      new User({
        id: 7,
        githubId: 1,
        username: 'aron0228',
        fullName: 'Reszegi Aron',
        email: 'aron@example.com',
        avatarUrl: 'https://example.com/avatar.png',
      }),
    createPayloadFactory: () => ({
      githubId: 1,
      username: 'aron0228',
      fullName: 'Reszegi Aron',
      email: 'aron@example.com',
      avatarUrl: 'https://example.com/avatar.png',
    }),
    updatePayloadFactory: () => ({
      fullName: 'Updated Name',
      avatarUrl: 'https://example.com/updated-avatar.png',
    }),
  });

  it('returns the placeholder delete profile response', async () => {
    const controller = new UserController({} as never);

    await expect(controller.deleteProfile()).resolves.toEqual({
      message: 'Not implemented',
    });
  });
});
