import type { TOC } from '@ember/component/template-only';
import { pageTitle } from 'ember-page-title';
import RoutesWorkspacesEditPullRequestsEdit from 'client/components/routes/workspaces/edit/pull-requests/edit';
import type { WorkspacesEditPullRequestsEditRouteModel } from 'client/routes/workspaces/edit/pull-requests/edit';

interface EditSignature {
  Args: {
    model: WorkspacesEditPullRequestsEditRouteModel;
    controller: unknown;
  };
}

<template>
  {{pageTitle "Pull Request"}}
  <RoutesWorkspacesEditPullRequestsEdit @model={{@model}} />
</template> satisfies TOC<EditSignature>;
