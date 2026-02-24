import type { TOC } from '@ember/component/template-only';
import { pageTitle } from 'ember-page-title';

interface ApplicationSignature {
  Args: {
    model: unknown;
    controller: unknown;
  };
}

<template>
  {{pageTitle "Application"}}
  {{outlet}}
</template> satisfies TOC<ApplicationSignature>;
