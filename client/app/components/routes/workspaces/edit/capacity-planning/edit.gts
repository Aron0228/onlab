import Component from '@glimmer/component';
import type WorkspaceModel from 'client/models/workspace';

export interface RoutesWorkspacesEditCapacityPlanningEditSignature {
  Args: {
    model: WorkspaceModel;
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
    <div class={{this.rootClass}} ...attributes></div>
  </template>
}
