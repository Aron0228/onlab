import type { TOC } from '@ember/component/template-only';
import { pageTitle } from 'ember-page-title';
import UiTest from 'client/components/ui/test';

interface ApplicationSignature {
  Args: {
    model: unknown;
    controller: unknown;
  };
}

<template>
  {{pageTitle "Application"}}
  {{outlet}}

  <UiTest />
</template> satisfies TOC<ApplicationSignature>;
