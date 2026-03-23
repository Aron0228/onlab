import type { TOC } from '@ember/component/template-only';
import type { WorkspacesEditIssuesRouteModel } from 'client/routes/workspaces/edit/issues';

export interface RoutesWorkspacesEditIssuesSignature {
  // The arguments accepted by the component
  Args: {
    model: WorkspacesEditIssuesRouteModel;
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
</template> satisfies TOC<RoutesWorkspacesEditIssuesSignature>;
