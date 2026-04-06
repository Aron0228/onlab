import type { TOC } from '@ember/component/template-only';
import { pageTitle } from 'ember-page-title';
import RoutesWorkspacesEditSettings from 'client/components/routes/workspaces/edit/settings';
import type WorkspaceModel from 'client/models/workspace';

interface SettingsSignature {
  Args: {
    model: WorkspaceModel;
    controller: unknown;
  };
}

<template>
  {{pageTitle "Settings"}}
  <RoutesWorkspacesEditSettings @model={{@model}} />
</template> satisfies TOC<SettingsSignature>;
