import Route from '@ember/routing/route';
import type CapacityPlanModel from 'client/models/capacity-plan';
import type { WorkspacesEditCapacityPlanningRouteModel } from 'client/routes/workspaces/edit/capacity-planning';

export type WorkspacesEditCapacityPlanningEditRouteModel =
  WorkspacesEditCapacityPlanningRouteModel & {
    selectedPlan: CapacityPlanModel | null;
  };

export default class WorkspacesEditCapacityPlanningEditRoute extends Route {
  queryParams = {
    planId: {
      refreshModel: true,
    },
  };

  model(params: {
    planId?: string;
  }): WorkspacesEditCapacityPlanningEditRouteModel {
    const capacityPlanningModel = this.modelFor(
      'workspaces.edit.capacity-planning'
    ) as WorkspacesEditCapacityPlanningRouteModel;
    const selectedPlan =
      capacityPlanningModel.plans.find(
        (plan) => Number(plan.id) === Number(params.planId)
      ) ??
      capacityPlanningModel.plans[0] ??
      null;

    return {
      ...capacityPlanningModel,
      selectedPlan,
    };
  }
}
