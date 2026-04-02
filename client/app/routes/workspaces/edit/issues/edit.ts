import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';
import type GithubIssueModel from 'client/models/github-issue';
import type { WorkspacesEditIssuesRouteModel } from 'client/routes/workspaces/edit/issues';

type StoreLike = {
  findRecord(
    modelName: 'github-issue',
    id: string | number
  ): Promise<GithubIssueModel>;
};

export type WorkspacesEditIssuesEditRouteModel = {
  workspaceId: number;
  issue: GithubIssueModel;
  repositoryName: string | null;
};

export default class WorkspacesEditIssuesEditRoute extends Route {
  @service declare store: StoreLike;

  async model(params: {
    issue_id: string;
  }): Promise<WorkspacesEditIssuesEditRouteModel> {
    const issuesModel = this.modelFor(
      'workspaces.edit.issues'
    ) as WorkspacesEditIssuesRouteModel;
    // eslint-disable-next-line warp-drive/no-legacy-request-patterns
    const issue = await this.store.findRecord('github-issue', params.issue_id);
    const repository = issuesModel.repositories.find(
      (workspaceRepository) =>
        Number(workspaceRepository.id) === Number(issue.repositoryId)
    );

    return {
      workspaceId: Number(issuesModel.workspace.id),
      issue,
      repositoryName: repository?.name ?? null,
    };
  }
}
