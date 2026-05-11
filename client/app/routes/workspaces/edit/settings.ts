import type WorkspaceModel from 'client/models/workspace';
import ProtectedRoute from 'client/routes/protected';
import type { WorkspacesIssuesRouteModel } from 'client/routes/workspaces/edit';

export default class WorkspacesEditSettingsRoute extends ProtectedRoute {
  async model(): Promise<WorkspaceModel> {
    const workspaceId = this.workspaceIdFromParentRoute();
    const canAccessSettings = await this.requireWorkspacePermission(
      workspaceId,
      'workspace.settings.manage'
    );

    if (!canAccessSettings) {
      return undefined as never;
    }

    return (this.modelFor('workspaces.edit') as WorkspacesIssuesRouteModel)
      .workspace;
  }
}
