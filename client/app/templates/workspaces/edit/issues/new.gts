import type { TOC } from '@ember/component/template-only';
import { pageTitle } from 'ember-page-title';
import RoutesWorkspacesEditIssuesNew from 'client/components/routes/workspaces/edit/issues/new';
import type { WorkspacesEditIssuesNewRouteModel } from 'client/routes/workspaces/edit/issues/new';

interface NewSignature {
  Args: {
    model: WorkspacesEditIssuesNewRouteModel;
    controller: unknown;
  };
}

<template>
  {{pageTitle "New Issue"}}
  <RoutesWorkspacesEditIssuesNew @model={{@model}} />
</template> satisfies TOC<NewSignature>;
