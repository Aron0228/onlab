import type {TOC} from '@ember/component/template-only';
import {pageTitle} from 'ember-page-title';
import RoutesWorkspacesEditIssues from 'client/components/routes/workspaces/edit/issues';
import type {WorkspacesEditIssuesRouteModel} from 'client/routes/workspaces/edit/issues';

interface IssuesSignature {
  Args: {
    model: WorkspacesEditIssuesRouteModel;
    controller: unknown;
  };
}

<template>
  {{pageTitle "Issues"}}
  <RoutesWorkspacesEditIssues @model={{@model}} />
</template> satisfies TOC<IssuesSignature>;
