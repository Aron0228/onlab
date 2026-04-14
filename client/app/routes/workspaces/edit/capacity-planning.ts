import Route from '@ember/routing/route';
import type WorkspaceModel from 'client/models/workspace';
import type { WorkspacesIssuesRouteModel } from 'client/routes/workspaces/edit';

export default class WorkspacesEditCapacityPlanningRoute extends Route {
  model(): WorkspaceModel {
    return (this.modelFor('workspaces.edit') as WorkspacesIssuesRouteModel)
      .workspace;
  }
}
