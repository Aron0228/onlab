import { inject as service } from '@ember/service';
import type GithubRepositoryModel from 'client/models/github-repository';
import type NewsFeedEntryModel from 'client/models/news-feed-entry';
import type WorkspaceModel from 'client/models/workspace';
import type { WorkspacesIssuesRouteModel } from 'client/routes/workspaces/edit';
import ProtectedRoute from 'client/routes/protected';

type StoreLike = {
  query(
    modelName: 'news-feed-entry',
    query: Record<string, unknown>
  ): Promise<ArrayLike<NewsFeedEntryModel>>;
};

export type WorkspacesEditNewsFeedRouteModel = {
  workspace: WorkspaceModel;
  repositories: GithubRepositoryModel[];
  entries: NewsFeedEntryModel[];
};

export default class WorkspacesEditNewsFeedRoute extends ProtectedRoute {
  @service declare store: StoreLike;

  async model(): Promise<WorkspacesEditNewsFeedRouteModel> {
    const workspacesEditModel = this.modelFor(
      'workspaces.edit'
    ) as WorkspacesIssuesRouteModel;
    const workspace = workspacesEditModel.workspace;
    const workspaceId = Number(workspace.id);
    const canAccessNewsFeed = await this.requireWorkspacePermission(
      workspaceId,
      'workspace.view'
    );

    if (!canAccessNewsFeed) {
      return {
        workspace,
        repositories: workspacesEditModel.repositories,
        entries: [],
      };
    }

    const entries =
      Number.isFinite(workspaceId) && workspaceId > 0
        ? await this.store.query('news-feed-entry', { workspaceId })
        : [];

    return {
      workspace,
      repositories: workspacesEditModel.repositories,
      entries: Array.from(entries),
    };
  }
}
