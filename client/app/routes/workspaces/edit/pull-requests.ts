import Route from '@ember/routing/route';
import type { WorkspacesIssuesRouteModel } from 'client/routes/workspaces/edit';

export default class WorkspacesEditPullRequestsRoute extends Route {
  model(): WorkspacesEditPullRequestsRouteModel {
    return this.modelFor('workspaces.edit') as WorkspacesEditPullRequestsRouteModel;
  }
}

export type WorkspacesEditPullRequestsRouteModel = WorkspacesIssuesRouteModel;
