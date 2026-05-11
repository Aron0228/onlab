import ProtectedRoute from 'client/routes/protected';
import type { WorkspacesEditIssuesRouteModel } from 'client/routes/workspaces/edit/issues';

export default class WorkspacesEditIssuesNewRoute extends ProtectedRoute {
  async model(): Promise<WorkspacesEditIssuesNewRouteModel> {
    const workspaceId = this.workspaceIdFromParentRoute();
    const canManageIssues = await this.requireWorkspacePermission(
      workspaceId,
      'github.issue.manage'
    );

    if (!canManageIssues) {
      return undefined as never;
    }

    return this.modelFor(
      'workspaces.edit.issues'
    ) as WorkspacesEditIssuesNewRouteModel;
  }
}

export type WorkspacesEditIssuesNewRouteModel = WorkspacesEditIssuesRouteModel;
