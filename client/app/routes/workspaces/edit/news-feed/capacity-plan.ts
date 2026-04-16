import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';
import type CapacityPlanEntryModel from 'client/models/capacity-plan-entry';
import type CapacityPlanModel from 'client/models/capacity-plan';
import type IssueAssignmentModel from 'client/models/issue-assignment';
import type { WorkspacesEditNewsFeedRouteModel } from 'client/routes/workspaces/edit/news-feed';

type StoreLike = {
  query(
    modelName: 'capacity-plan',
    query: Record<string, unknown>
  ): Promise<ArrayLike<CapacityPlanModel>>;
  query(
    modelName: 'capacity-plan-entry',
    query: Record<string, unknown>
  ): Promise<ArrayLike<CapacityPlanEntryModel>>;
  query(
    modelName: 'issue-assignment',
    query: Record<string, unknown>
  ): Promise<ArrayLike<IssueAssignmentModel>>;
};

export type WorkspacesEditNewsFeedCapacityPlanRouteModel = {
  workspaceId: number;
  plan: CapacityPlanModel;
  entries: CapacityPlanEntryModel[];
  issueAssignments: IssueAssignmentModel[];
};

export default class WorkspacesEditNewsFeedCapacityPlanRoute extends Route {
  @service declare store: StoreLike;

  async model(params: {
    plan_id: string;
  }): Promise<WorkspacesEditNewsFeedCapacityPlanRouteModel> {
    const newsFeedModel = this.modelFor(
      'workspaces.edit.news-feed'
    ) as WorkspacesEditNewsFeedRouteModel;
    const plans = await this.store.query('capacity-plan', {
      filter: {
        where: {
          id: Number(params.plan_id),
        },
      },
    });
    const [plan] = Array.from(plans);

    if (!plan) {
      throw new Error(`Capacity plan ${params.plan_id} was not found`);
    }

    const [entries, issueAssignments] = await Promise.all([
      this.store.query('capacity-plan-entry', {
        filter: {
          include: ['user'],
          where: {
            capacityPlanId: Number(plan.id),
          },
          order: ['id ASC'],
        },
      }),
      this.store.query('issue-assignment', {
        filter: {
          include: ['issue', 'user'],
          where: {
            capacityPlanId: Number(plan.id),
          },
          order: ['id ASC'],
        },
      }),
    ]);

    return {
      workspaceId: Number(newsFeedModel.workspace.id),
      plan,
      entries: Array.from(entries),
      issueAssignments: Array.from(issueAssignments),
    };
  }
}
