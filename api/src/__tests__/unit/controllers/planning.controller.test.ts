import {describe} from 'vitest';

import {
  CapacityPlanController,
  CapacityPlanEntryController,
  IssueAssignmentController,
} from '../../../controllers';
import {
  CapacityPlan,
  CapacityPlanEntry,
  IssueAssignment,
} from '../../../models';
import {describeCrudController} from './test-helpers';

describe('Planning controllers (unit)', () => {
  describeCrudController({
    controllerName: 'CapacityPlanController',
    createController: repository =>
      new CapacityPlanController(repository as never),
    id: 8,
    filter: {where: {workspaceId: 3}},
    where: {workspaceId: 3},
    entityFactory: () =>
      new CapacityPlan({
        id: 8,
        workspaceId: 3,
        start: '2026-04-13T08:00:00.000Z',
        end: '2026-04-17T17:00:00.000Z',
      }),
    createPayloadFactory: () => ({
      workspaceId: 3,
      start: '2026-04-13T08:00:00.000Z',
      end: '2026-04-17T17:00:00.000Z',
    }),
    updatePayloadFactory: () => ({
      end: '2026-04-18T12:00:00.000Z',
    }),
    relationName: 'workspace',
    relationValueFactory: () => ({
      id: 3,
      name: 'Delivery',
    }),
  });

  describeCrudController({
    controllerName: 'CapacityPlanEntryController',
    createController: repository =>
      new CapacityPlanEntryController(repository as never),
    id: 4,
    filter: {where: {capacityPlanId: 8}},
    where: {capacityPlanId: 8},
    entityFactory: () =>
      new CapacityPlanEntry({
        id: 4,
        capacityPlanId: 8,
        userId: 5,
        capacityHours: 24,
      }),
    createPayloadFactory: () => ({
      capacityPlanId: 8,
      userId: 5,
      capacityHours: 24,
    }),
    updatePayloadFactory: () => ({
      capacityHours: 20,
    }),
    relationName: 'user',
    relationValueFactory: () => ({
      id: 5,
      username: 'aron0228',
    }),
  });

  describeCrudController({
    controllerName: 'IssueAssignmentController',
    createController: repository =>
      new IssueAssignmentController(repository as never),
    id: 9,
    filter: {where: {capacityPlanId: 8}},
    where: {capacityPlanId: 8},
    entityFactory: () =>
      new IssueAssignment({
        id: 9,
        issueId: 11,
        userId: 5,
        capacityPlanId: 8,
        assignedHours: 6,
      }),
    createPayloadFactory: () => ({
      issueId: 11,
      userId: 5,
      capacityPlanId: 8,
      assignedHours: 6,
    }),
    updatePayloadFactory: () => ({
      assignedHours: 8,
    }),
    relationName: 'capacityPlan',
    relationValueFactory: () => ({
      id: 8,
      workspaceId: 3,
    }),
  });
});
