import type { TOC } from '@ember/component/template-only';
import { pageTitle } from 'ember-page-title';
import RoutesLogin from 'client/components/routes/login';

interface AuthLoginSignature {
  Args: {
    model: unknown;
    controller: unknown;
  };
}

<template>
  {{pageTitle "Login"}}
  <RoutesLogin />
</template> satisfies TOC<AuthLoginSignature>;
