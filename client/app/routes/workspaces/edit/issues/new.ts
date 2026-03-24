import Route from '@ember/routing/route';
import type { WorkspacesEditIssuesRouteModel } from 'client/routes/workspaces/edit/issues';

export default class WorkspacesEditIssuesNewRoute extends Route {
  model(): WorkspacesEditIssuesNewRouteModel {
    return this.modelFor(
      'workspaces.edit.issues'
    ) as WorkspacesEditIssuesNewRouteModel;
  }
}

export type WorkspacesEditIssuesNewRouteModel = WorkspacesEditIssuesRouteModel;
