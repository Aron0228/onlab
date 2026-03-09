import type { TOC } from '@ember/component/template-only';
import { pageTitle } from 'ember-page-title';
import UiThemeSwitcher from 'client/components/ui/theme-switcher';
import RoutesLogin from 'client/components/routes/login';

interface ApplicationSignature {
  Args: {
    model: unknown;
    controller: unknown;
  };
}

<template>
  {{pageTitle "Application"}}
  <RoutesLogin />
  {{outlet}}
</template> satisfies TOC<ApplicationSignature>;
