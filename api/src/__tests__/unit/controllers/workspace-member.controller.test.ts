import {describe} from 'vitest';

import {WorkspaceMember} from '../../../models';
import {WorkspaceMemberController} from '../../../controllers/system/workspace-member.controller';
import {describeCrudController} from './test-helpers';

describe('WorkspaceMemberController (unit)', () => {
  describeCrudController({
    controllerName: 'WorkspaceMemberController',
    createController: repository =>
      new WorkspaceMemberController(repository as never),
    id: 17,
    filter: {where: {workspaceId: 11}},
    where: {workspaceId: 11},
    entityFactory: () =>
      new WorkspaceMember({
        id: 17,
        userId: 7,
        workspaceId: 11,
        role: 'MEMBER',
      }),
    createPayloadFactory: () => ({
      userId: 7,
      workspaceId: 11,
      role: 'MEMBER',
    }),
    updatePayloadFactory: () => ({
      role: 'ADMIN',
    }),
    relationName: 'user',
    relationValueFactory: () => ({
      id: 7,
      username: 'aron0228',
    }),
  });
});
