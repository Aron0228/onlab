import Component from '@glimmer/component';
import RoutesWorkspacesEditCapacityPlanningEditor from 'client/components/routes/workspaces/edit/capacity-planning/editor';
import type { WorkspacesEditCapacityPlanningEditRouteModel } from 'client/routes/workspaces/edit/capacity-planning/edit';

export interface RoutesWorkspacesEditCapacityPlanningEditSignature {
  Args: {
    model: WorkspacesEditCapacityPlanningEditRouteModel;
  };
  Blocks: {
    default: [];
  };
  Element: HTMLDivElement;
}

export default class RoutesWorkspacesEditCapacityPlanningEdit extends Component<RoutesWorkspacesEditCapacityPlanningEditSignature> {
  get rootClass(): string {
    return 'route-workspaces-edit-capacity-planning-edit';
  }

  <template>
    <RoutesWorkspacesEditCapacityPlanningEditor
      class={{this.rootClass}}
      @model={{@model}}
      @mode="edit"
      ...attributes
    />
  </template>
}
