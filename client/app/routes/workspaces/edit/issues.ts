import Route from '@ember/routing/route';
import type { WorkspacesIssuesRouteModel } from 'client/routes/workspaces/edit';

export default class WorkspacesEditIssuesRoute extends Route {
  model(): WorkspacesEditIssuesRouteModel {
    return this.modelFor('workspaces.edit') as WorkspacesEditIssuesRouteModel;
  }
}

export type WorkspacesEditIssuesRouteModel = WorkspacesIssuesRouteModel;
