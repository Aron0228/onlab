import Route from '@ember/routing/route';
import type { WorkspacesEditCapacityPlanningRouteModel } from 'client/routes/workspaces/edit/capacity-planning';

export type WorkspacesEditCapacityPlanningIndexRouteModel =
  WorkspacesEditCapacityPlanningRouteModel;

export default class WorkspacesEditCapacityPlanningIndexRoute extends Route {
  model(): WorkspacesEditCapacityPlanningIndexRouteModel {
    return this.modelFor(
      'workspaces.edit.capacity-planning'
    ) as WorkspacesEditCapacityPlanningIndexRouteModel;
  }
}
