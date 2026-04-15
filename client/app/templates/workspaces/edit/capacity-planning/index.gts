import type { TOC } from '@ember/component/template-only';
import { pageTitle } from 'ember-page-title';
import RoutesWorkspacesEditCapacityPlanningIndex from 'client/components/routes/workspaces/edit/capacity-planning/index';
import type { WorkspacesEditCapacityPlanningIndexRouteModel } from 'client/routes/workspaces/edit/capacity-planning/index';

interface CapacityPlanningSignature {
  Args: {
    model: WorkspacesEditCapacityPlanningIndexRouteModel;
    controller: unknown;
  };
}

<template>
  {{pageTitle "Capacity Planning"}}
  <RoutesWorkspacesEditCapacityPlanningIndex @model={{@model}} />
  {{outlet}}
</template> satisfies TOC<CapacityPlanningSignature>;
