import type { TOC } from '@ember/component/template-only';
import { pageTitle } from 'ember-page-title';
import RoutesWorkspacesEditCapacityPlanningNew from 'client/components/routes/workspaces/edit/capacity-planning/new';
import type { WorkspacesEditCapacityPlanningNewRouteModel } from 'client/routes/workspaces/edit/capacity-planning/new';

interface NewSignature {
  Args: {
    model: WorkspacesEditCapacityPlanningNewRouteModel;
    controller: unknown;
  };
}

<template>
  {{pageTitle "New Capacity Plan"}}
  <RoutesWorkspacesEditCapacityPlanningNew @model={{@model}} />
</template> satisfies TOC<NewSignature>;
