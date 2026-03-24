import type { TOC } from '@ember/component/template-only';
import { pageTitle } from 'ember-page-title';
import RoutesWorkspacesEditIssuesEdit from 'client/components/routes/workspaces/edit/issues/edit';
import type { WorkspacesEditIssuesEditRouteModel } from 'client/routes/workspaces/edit/issues/edit';

interface EditSignature {
  Args: {
    model: WorkspacesEditIssuesEditRouteModel;
    controller: unknown;
  };
}

<template>
  {{pageTitle "Issue"}}
  <RoutesWorkspacesEditIssuesEdit @model={{@model}} />
</template> satisfies TOC<EditSignature>;
