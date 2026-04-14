import Component from '@glimmer/component';
import type WorkspaceModel from 'client/models/workspace';

export interface RoutesWorkspacesEditCapacityPlanningNewSignature {
  Args: {
    model: WorkspaceModel;
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
    <div class={{this.rootClass}} ...attributes></div>
  </template>
}
