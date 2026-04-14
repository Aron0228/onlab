import type { TOC } from '@ember/component/template-only';
import { pageTitle } from 'ember-page-title';
import RoutesWorkspacesEditCapacityPlanning from 'client/components/routes/workspaces/edit/capacity-planning';
import type WorkspaceModel from 'client/models/workspace';

interface CapacityPlanningSignature {
  Args: {
    model: WorkspaceModel;
    controller: unknown;
  };
}

<template>
  {{pageTitle "Capacity Planning"}}
  <div class="workspaces-edit-capacity-planning-layout">
    <RoutesWorkspacesEditCapacityPlanning @model={{@model}} />
    {{outlet}}
  </div>
</template> satisfies TOC<CapacityPlanningSignature>;
