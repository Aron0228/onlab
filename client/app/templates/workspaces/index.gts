import type { TOC } from '@ember/component/template-only';
import { pageTitle } from 'ember-page-title';

interface IndexSignature {
  Args: {
    model: unknown;
    controller: unknown;
  };
}

<template>
  {{pageTitle "Workspaces"}}
  {{outlet}}
</template> satisfies TOC<IndexSignature>;
