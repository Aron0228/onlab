import { module, test } from 'qunit';
import { setupTest } from 'client/tests/helpers';
import type CapacityPlanModel from 'client/models/capacity-plan';
import type CapacityPlanEntryModel from 'client/models/capacity-plan-entry';
import type GithubIssueModel from 'client/models/github-issue';
import type GithubRepositoryModel from 'client/models/github-repository';
import type WorkspaceModel from 'client/models/workspace';
import type {
  CapacityPlanningTeamMember,
  WorkspacesEditCapacityPlanningRouteModel,
} from 'client/routes/workspaces/edit/capacity-planning';
import type WorkspacesEditCapacityPlanningNewRoute from 'client/routes/workspaces/edit/capacity-planning/new';

module(
  'Unit | Route | workspaces/edit/capacity-planning/new',
  function (hooks) {
    setupTest(hooks);

    test('it exists', function (assert) {
      const route = this.owner.lookup(
        'route:workspaces/edit/capacity-planning/new'
      );
      assert.ok(route);
    });

    test('it seeds draft capacity hours from the latest saved entries', function (assert) {
      const route = this.owner.lookup(
        'route:workspaces/edit/capacity-planning/new'
      ) as WorkspacesEditCapacityPlanningNewRoute;

      const modelFor = () =>
        ({
          workspace: {
            id: 12,
            name: 'Test Workspace',
          } as unknown as WorkspaceModel,
          repositories: [] as GithubRepositoryModel[],
          plans: [
            { id: 22, start: '2026-04-14', end: '2026-04-18' },
            { id: 21, start: '2026-04-07', end: '2026-04-11' },
          ] as unknown as CapacityPlanModel[],
          entries: [
            { capacityPlanId: 21, userId: 8, capacityHours: 24 },
            { capacityPlanId: 22, userId: 8, capacityHours: 32 },
            { capacityPlanId: 21, userId: 9, capacityHours: 16 },
          ] as unknown as CapacityPlanEntryModel[],
          issueAssignments: [],
          teamMembers: [
            {
              id: 'member-8',
              user: { id: 8, username: 'alex', fullName: 'Alex' },
              role: 'MEMBER',
            },
            {
              id: 'member-9',
              user: { id: 9, username: 'sam', fullName: 'Sam' },
              role: 'MEMBER',
            },
            {
              id: 'member-10',
              user: { id: 10, username: 'tay', fullName: 'Tay' },
              role: 'MEMBER',
            },
          ] as unknown as CapacityPlanningTeamMember[],
          issues: [] as GithubIssueModel[],
        }) as WorkspacesEditCapacityPlanningRouteModel;

      route.modelFor = modelFor as typeof route.modelFor;

      const model = route.model();

      assert.strictEqual(model.selectedPlan, null);
      assert.deepEqual(model.draftCapacityHoursByUserId, {
        8: 32,
        9: 16,
        10: 0,
      });
    });
  }
);
