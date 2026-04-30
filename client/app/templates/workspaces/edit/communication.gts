import type { TOC } from '@ember/component/template-only';
import { pageTitle } from 'ember-page-title';
import RoutesWorkspacesEditCommunication from 'client/components/routes/workspaces/edit/communication';
import type { WorkspacesEditCommunicationRouteModel } from 'client/routes/workspaces/edit/communication';

interface Signature {
  Args: {
    model: WorkspacesEditCommunicationRouteModel;
    controller: unknown;
  };
}

<template>
  {{pageTitle "Communication"}}
  <RoutesWorkspacesEditCommunication @model={{@model}} />
</template> satisfies TOC<Signature>;
