import type { TOC } from '@ember/component/template-only';
import { pageTitle } from 'ember-page-title';
import RoutesClientDebug from 'client/components/routes/client-debug';

interface DebugClientSignature {
  Args: {
    model: unknown;
    controller: unknown;
  };
}

<template>
  {{pageTitle "Client Debug"}}
  <RoutesClientDebug />
</template> satisfies TOC<DebugClientSignature>;
