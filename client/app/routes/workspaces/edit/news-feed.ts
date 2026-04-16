import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';
import type GithubRepositoryModel from 'client/models/github-repository';
import type NewsFeedEntryModel from 'client/models/news-feed-entry';
import type WorkspaceModel from 'client/models/workspace';
import type SessionAccountService from 'client/services/session-account';
import type { WorkspacesIssuesRouteModel } from 'client/routes/workspaces/edit';

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

export default class WorkspacesEditNewsFeedRoute extends Route {
  @service declare store: StoreLike;
  @service declare sessionAccount: SessionAccountService;

  async model(): Promise<WorkspacesEditNewsFeedRouteModel> {
    const workspacesEditModel = this.modelFor(
      'workspaces.edit'
    ) as WorkspacesIssuesRouteModel;
    const workspace = workspacesEditModel.workspace;
    const userId = Number(this.sessionAccount.id);

    const entries =
      Number.isFinite(userId) && userId > 0
        ? await this.store.query('news-feed-entry', {
            workspaceId: Number(workspace.id),
            userId,
          })
        : [];

    return {
      workspace,
      repositories: workspacesEditModel.repositories,
      entries: Array.from(entries),
    };
  }
}
