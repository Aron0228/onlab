import type { TOC } from '@ember/component/template-only';
import { pageTitle } from 'ember-page-title';
import RoutesWorkspacesNew from 'client/components/routes/workspaces/new';
import type WorkspaceModel from 'client/models/workspace';

interface NewSignature {
  Args: {
    model: WorkspaceModel;
    controller: unknown;
  };
}

<template>
  {{pageTitle "New"}}
  {{outlet}}
  <RoutesWorkspacesNew @model={{@model}} />
</template> satisfies TOC<NewSignature>;
