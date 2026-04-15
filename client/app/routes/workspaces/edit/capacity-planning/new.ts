import Route from '@ember/routing/route';
import type CapacityPlanModel from 'client/models/capacity-plan';
import type { WorkspacesEditCapacityPlanningRouteModel } from 'client/routes/workspaces/edit/capacity-planning';

export type WorkspacesEditCapacityPlanningNewRouteModel =
  WorkspacesEditCapacityPlanningRouteModel & {
    draftCapacityHoursByUserId: Record<number, number>;
    selectedPlan: CapacityPlanModel | null;
  };

export default class WorkspacesEditCapacityPlanningNewRoute extends Route {
  model(): WorkspacesEditCapacityPlanningNewRouteModel {
    const capacityPlanningModel = this.modelFor(
      'workspaces.edit.capacity-planning'
    ) as WorkspacesEditCapacityPlanningRouteModel;

    const draftCapacityHoursByUserId = capacityPlanningModel.teamMembers.reduce<
      Record<number, number>
    >((hoursByUserId, member) => {
      const latestEntry = capacityPlanningModel.plans
        .map((plan) =>
          capacityPlanningModel.entries.find(
            (entry) =>
              Number(entry.capacityPlanId) === Number(plan.id) &&
              Number(entry.userId) === Number(member.user.id)
          )
        )
        .find((entry) => entry);

      hoursByUserId[Number(member.user.id)] = Number(
        latestEntry?.capacityHours ?? 0
      );

      return hoursByUserId;
    }, {});

    return {
      ...capacityPlanningModel,
      draftCapacityHoursByUserId,
      selectedPlan: null,
    };
  }
}
