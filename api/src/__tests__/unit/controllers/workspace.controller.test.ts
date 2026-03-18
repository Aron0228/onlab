import {describe} from 'vitest';

import {Workspace} from '../../../models';
import {WorkspaceController} from '../../../controllers/system/workspace.controller';
import {describeCrudController} from './test-helpers';

describe('WorkspaceController (unit)', () => {
  describeCrudController({
    controllerName: 'WorkspaceController',
    createController: repository =>
      new WorkspaceController(repository as never),
    id: 11,
    filter: {where: {ownerId: 7}},
    where: {ownerId: 7},
    entityFactory: () =>
      new Workspace({
        id: 11,
        name: 'Demo Workspace',
        ownerId: 7,
        avatarUrl: 'https://example.com/workspace.png',
      }),
    createPayloadFactory: () => ({
      name: 'Demo Workspace',
      ownerId: 7,
      avatarUrl: 'https://example.com/workspace.png',
    }),
    updatePayloadFactory: () => ({
      name: 'Updated Workspace',
      avatarUrl: 'https://example.com/updated-workspace.png',
    }),
    relationName: 'owner',
    relationValueFactory: () => ({
      id: 7,
      username: 'aron0228',
    }),
  });
});
