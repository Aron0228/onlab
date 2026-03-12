import type { TOC } from '@ember/component/template-only';
import { pageTitle } from 'ember-page-title';
import RoutesWorkspacesNew from 'client/components/routes/workspaces/new';

interface NewSignature {
  Args: {
    model: unknown;
    controller: unknown;
  };
}

<template>
  {{pageTitle "New"}}
  {{outlet}}
  <RoutesWorkspacesNew />
</template> satisfies TOC<NewSignature>;
