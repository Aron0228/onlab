import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';
import type GithubIssueModel from 'client/models/github-issue';
import type { WorkspacesEditNewsFeedRouteModel } from 'client/routes/workspaces/edit/news-feed';

type StoreLike = {
  query(
    modelName: 'github-issue',
    options: Record<string, unknown>
  ): Promise<GithubIssueModel[]>;
};

export type WorkspacesEditNewsFeedIssueRouteModel = {
  workspaceId: number;
  issue: GithubIssueModel;
  repositoryName: string | null;
};

export default class WorkspacesEditNewsFeedIssueRoute extends Route {
  @service declare store: StoreLike;

  async model(params: {
    issue_id: string;
  }): Promise<WorkspacesEditNewsFeedIssueRouteModel> {
    const newsFeedModel = this.modelFor(
      'workspaces.edit.news-feed'
    ) as WorkspacesEditNewsFeedRouteModel;
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

    const repository = newsFeedModel.repositories.find(
      (workspaceRepository) =>
        Number(workspaceRepository.id) === Number(issue.repositoryId)
    );

    return {
      workspaceId: Number(newsFeedModel.workspace.id),
      issue,
      repositoryName: repository?.name ?? null,
    };
  }
}
