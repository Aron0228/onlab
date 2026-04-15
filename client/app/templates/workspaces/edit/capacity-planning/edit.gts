import type { TOC } from '@ember/component/template-only';
import { pageTitle } from 'ember-page-title';
import RoutesWorkspacesEditCapacityPlanningEdit from 'client/components/routes/workspaces/edit/capacity-planning/edit';
import type { WorkspacesEditCapacityPlanningEditRouteModel } from 'client/routes/workspaces/edit/capacity-planning/edit';

interface EditSignature {
  Args: {
    model: WorkspacesEditCapacityPlanningEditRouteModel;
    controller: unknown;
  };
}

<template>
  {{pageTitle "Edit Capacity Plan"}}
  <RoutesWorkspacesEditCapacityPlanningEdit @model={{@model}} />
</template> satisfies TOC<EditSignature>;
