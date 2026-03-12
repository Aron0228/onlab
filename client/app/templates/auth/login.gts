import type { TOC } from '@ember/component/template-only';
import { pageTitle } from 'ember-page-title';
import RoutesAuthLogin from 'client/components/routes/auth/login';

interface AuthLoginSignature {
  Args: {
    model: unknown;
    controller: unknown;
  };
}

<template>
  {{pageTitle "Login"}}
  <RoutesAuthLogin />
</template> satisfies TOC<AuthLoginSignature>;
