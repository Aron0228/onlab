import Route from '@ember/routing/route';
import type WorkspaceModel from 'client/models/workspace';

export default class WorkspacesEditCapacityPlanningEditRoute extends Route {
  model(): WorkspaceModel {
    return this.modelFor(
      'workspaces.edit.capacity-planning'
    ) as WorkspaceModel;
  }
}
