import type { TOC } from '@ember/component/template-only';
import { pageTitle } from 'ember-page-title';
import RoutesWorkspacesEditPullRequests from 'client/components/routes/workspaces/edit/pull-requests';
import type { WorkspacesEditPullRequestsRouteModel } from 'client/routes/workspaces/edit/pull-requests';

interface PullRequestsSignature {
  Args: {
    model: WorkspacesEditPullRequestsRouteModel;
    controller: unknown;
  };
}

<template>
  {{pageTitle "PullRequests"}}
  <RoutesWorkspacesEditPullRequests @model={{@model}} />
</template> satisfies TOC<PullRequestsSignature>;
