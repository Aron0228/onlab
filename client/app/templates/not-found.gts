import type { TOC } from '@ember/component/template-only';
import { pageTitle } from 'ember-page-title';
import { LinkTo } from '@ember/routing';

interface NotFoundSignature {
  Args: {
    model: unknown;
    controller: unknown;
  };
}

<template>
  {{pageTitle "404"}}

  <section class="layout-vertical --gap-md --padding-md">
    <h1>404</h1>
    <p>The page you requested does not exist.</p>
    <LinkTo @route="auth.login">Go to login</LinkTo>
  </section>
</template> satisfies TOC<NotFoundSignature>;
