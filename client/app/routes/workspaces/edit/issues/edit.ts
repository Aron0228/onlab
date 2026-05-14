import { service } from '@ember/service';
import type GithubIssueModel from 'client/models/github-issue';
import ProtectedRoute from 'client/routes/protected';
import type { WorkspacesEditIssuesRouteModel } from 'client/routes/workspaces/edit/issues';

type StoreLike = {
  query(
    modelName: 'github-issue',
    options: Record<string, unknown>
  ): Promise<GithubIssueModel[]>;
};

export type WorkspacesEditIssuesEditRouteModel = {
  workspaceId: number;
  issue: GithubIssueModel;
  repositoryName: string | null;
};

export default class WorkspacesEditIssuesEditRoute extends ProtectedRoute {
  @service declare store: StoreLike;

  async model(params: {
    issue_id: string;
  }): Promise<WorkspacesEditIssuesEditRouteModel> {
    const issuesModel = this.modelFor(
      'workspaces.edit.issues'
    ) as WorkspacesEditIssuesRouteModel;
    const workspaceId = Number(issuesModel.workspace.id);
    const canManageIssues = await this.requireWorkspacePermission(
      workspaceId,
      'github.issue.manage'
    );

    if (!canManageIssues) {
      return undefined as never;
    }

    const [issue] = await this.store.query('github-issue', {
      filter: {
        include: ['aiPrediction'],
        where: {
          id: Number(params.issue_id),
        },
      },
    });

    if (!issue) {
      throw new Error(`GitHub issue ${params.issue_id} was not found`);
    }

    const repository = issuesModel.repositories.find(
      (workspaceRepository) =>
        Number(workspaceRepository.id) === Number(issue.repositoryId)
    );

    return {
      workspaceId,
      issue,
      repositoryName: repository?.name ?? null,
    };
  }
}
