import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';
import type WorkspaceModel from 'client/models/workspace';
import type GithubRepositoryModel from 'client/models/github-repository';

type StoreLike = {
  findRecord(modelName: 'workspace', id: number): Promise<WorkspaceModel>;
  query(
    modelName: 'github-repository',
    query: Record<string, unknown>
  ): Promise<ArrayLike<GithubRepositoryModel>>;
};

type LastWorkspaceServiceLike = {
  setWorkspaceId(workspaceId: number): void;
};

export type WorkspacesIssuesRouteModel = {
  workspace: WorkspaceModel;
  repositories: GithubRepositoryModel[];
};

export default class WorkspacesEditRoute extends Route {
  @service declare store: StoreLike;
  @service declare lastWorkspace: LastWorkspaceServiceLike;

  async model(params: { id: string }): Promise<WorkspacesIssuesRouteModel> {
    const workspaceId = Number.parseInt(params.id, 10);

    // eslint-disable-next-line warp-drive/no-legacy-request-patterns
    const workspace = await this.store.findRecord('workspace', workspaceId);
    // eslint-disable-next-line warp-drive/no-legacy-request-patterns
    const repositories = await this.store.query('github-repository', {
      filter: {
        where: {
          workspaceId,
        },
        order: ['name ASC'],
      },
    });

    return {
      workspace,
      repositories: Array.from(repositories),
    };
  }

  afterModel(model: WorkspacesIssuesRouteModel): void {
    this.lastWorkspace.setWorkspaceId(Number(model.workspace.id));
  }
}
