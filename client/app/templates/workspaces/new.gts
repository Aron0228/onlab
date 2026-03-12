import type { TOC } from '@ember/component/template-only';
import { pageTitle } from 'ember-page-title';

interface NewSignature {
  Args: {
    model: unknown;
    controller: unknown;
  };
}

<template>
  {{pageTitle "New"}}
  {{outlet}}
</template> satisfies TOC<NewSignature>;
