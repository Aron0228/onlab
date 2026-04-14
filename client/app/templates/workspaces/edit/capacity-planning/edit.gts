import type { TOC } from '@ember/component/template-only';
import { pageTitle } from 'ember-page-title';
import RoutesWorkspacesEditCapacityPlanningEdit from 'client/components/routes/workspaces/edit/capacity-planning/edit';
import type WorkspaceModel from 'client/models/workspace';

interface EditSignature {
  Args: {
    model: WorkspaceModel;
    controller: unknown;
  };
}

<template>
  {{pageTitle "Edit Capacity Plan"}}
  <RoutesWorkspacesEditCapacityPlanningEdit @model={{@model}} />
</template> satisfies TOC<EditSignature>;
