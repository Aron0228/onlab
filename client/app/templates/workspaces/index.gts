import type { TOC } from '@ember/component/template-only';
import { pageTitle } from 'ember-page-title';
import RoutesWorkspacesIndex from 'client/components/routes/workspaces/index';

interface IndexSignature {
  Args: {
    model: object | null;
    controller: unknown;
  };
}

<template>
  {{pageTitle "Workspaces"}}
  {{outlet}}
  <RoutesWorkspacesIndex />
</template> satisfies TOC<IndexSignature>;
