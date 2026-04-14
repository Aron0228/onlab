import Component from '@glimmer/component';
import type WorkspaceModel from 'client/models/workspace';

export interface RoutesWorkspacesEditCapacityPlanningSignature {
  Args: {
    model: WorkspaceModel;
  };
  Blocks: {
    default: [];
  };
  Element: HTMLDivElement;
}

export default class RoutesWorkspacesEditCapacityPlanning extends Component<RoutesWorkspacesEditCapacityPlanningSignature> {
  get rootClass(): string {
    return 'route-workspaces-edit-capacity-planning';
  }

  <template>
    <div class={{this.rootClass}} ...attributes></div>
  </template>
}
