import type { TOC } from '@ember/component/template-only';
import type { WorkspacesEditPullRequestsRouteModel } from 'client/routes/workspaces/edit/pull-requests';

export interface RoutesWorkspacesEditPullRequestsSignature {
  // The arguments accepted by the component
  Args: {
    model: WorkspacesEditPullRequestsRouteModel;
  };
  // Any blocks yielded by the component
  Blocks: {
    default: []
  };
  // The element to which `...attributes` is applied in the component template
  Element: null;
}

<template>
  {{yield}}
</template> satisfies TOC<RoutesWorkspacesEditPullRequestsSignature>;
