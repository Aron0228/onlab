import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';
import type GithubPullRequestModel from 'client/models/github-pull-request';
import type { WorkspacesEditPullRequestsRouteModel } from 'client/routes/workspaces/edit/pull-requests';

type StoreLike = {
  query(
    modelName: 'github-pull-request',
    options: Record<string, unknown>
  ): Promise<GithubPullRequestModel[]>;
};

export type WorkspacesEditPullRequestsEditRouteModel = {
  workspaceId: number;
  pullRequest: GithubPullRequestModel;
  repositoryName: string | null;
};

export default class WorkspacesEditPullRequestsEditRoute extends Route {
  @service declare store: StoreLike;

  async model(params: {
    pull_request_id: string;
  }): Promise<WorkspacesEditPullRequestsEditRouteModel> {
    const pullRequestsModel = this.modelFor(
      'workspaces.edit.pull-requests'
    ) as WorkspacesEditPullRequestsRouteModel;
    const [pullRequest] = await this.store.query('github-pull-request', {
      filter: {
        include: ['aiPrediction'],
        where: {
          id: Number(params.pull_request_id),
        },
      },
    });

    if (!pullRequest) {
      throw new Error(
        `GitHub pull request ${params.pull_request_id} was not found`
      );
    }

    const repository = pullRequestsModel.repositories.find(
      (workspaceRepository) =>
        Number(workspaceRepository.id) === Number(pullRequest.repositoryId)
    );

    return {
      workspaceId: Number(pullRequestsModel.workspace.id),
      pullRequest,
      repositoryName: repository?.name ?? null,
    };
  }
}
