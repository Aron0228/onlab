import type { TOC } from '@ember/component/template-only';
import { pageTitle } from 'ember-page-title';

interface CallbackSignature {
  Args: {
    model: unknown;
    controller: unknown;
  };
}

<template>
  {{pageTitle "Callback"}}
  {{outlet}}
</template> satisfies TOC<CallbackSignature>;
