import type { TOC } from '@ember/component/template-only';
import { pageTitle } from 'ember-page-title';
import RoutesWorkspacesEdit from 'client/components/routes/workspaces/edit';
import type { WorkspacesIssuesRouteModel } from 'client/routes/workspaces/edit';

interface EditSignature {
  Args: {
    model: WorkspacesIssuesRouteModel;
    controller: unknown;
  };
}

<template>
  {{pageTitle "Edit"}}
  <RoutesWorkspacesEdit @model={{@model}}>
    {{outlet}}
  </RoutesWorkspacesEdit>
</template> satisfies TOC<EditSignature>;
