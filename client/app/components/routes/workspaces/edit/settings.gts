import Component from '@glimmer/component';
import type WorkspaceModel from 'client/models/workspace';

export interface RoutesWorkspacesEditSettingsSignature {
  Args: {
    model: WorkspaceModel;
  };
  Blocks: {
    default: [];
  };
  Element: null;
}

export default class RoutesWorkspacesEditSettings extends Component<RoutesWorkspacesEditSettingsSignature> {
  <template>{{yield}}</template>
}
