import Component from '@glimmer/component';
import RoutesWorkspacesEditCapacityPlanningEditor from 'client/components/routes/workspaces/edit/capacity-planning/editor';
import type { WorkspacesEditCapacityPlanningNewRouteModel } from 'client/routes/workspaces/edit/capacity-planning/new';

export interface RoutesWorkspacesEditCapacityPlanningNewSignature {
  Args: {
    model: WorkspacesEditCapacityPlanningNewRouteModel;
  };
  Blocks: {
    default: [];
  };
  Element: HTMLDivElement;
}

export default class RoutesWorkspacesEditCapacityPlanningNew extends Component<RoutesWorkspacesEditCapacityPlanningNewSignature> {
  get rootClass(): string {
    return 'route-workspaces-edit-capacity-planning-new';
  }

  <template>
    <RoutesWorkspacesEditCapacityPlanningEditor
      class={{this.rootClass}}
      @model={{@model}}
      @mode="new"
      ...attributes
    />
  </template>
}
