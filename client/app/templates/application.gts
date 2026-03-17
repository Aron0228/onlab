import type { TOC } from '@ember/component/template-only';
import { pageTitle } from 'ember-page-title';
import FlashMessages from 'client/components/flash-messages';

interface ApplicationSignature {
  Args: {
    model: unknown;
    controller: unknown;
  };
}

<template>
  {{pageTitle "Application"}}
  <FlashMessages />

  {{outlet}}
</template> satisfies TOC<ApplicationSignature>;
