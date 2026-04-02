import type { TOC } from '@ember/component/template-only';
import { pageTitle } from 'ember-page-title';
import RoutesProfile from 'client/components/routes/profile';

interface ProfileSignature {
  Args: {
    model: {
      routeBack: string;
      routeBackUrl: string | null;
    };
    controller: unknown;
  };
}

<template>
  {{pageTitle "Profile"}}
  <RoutesProfile
    @routeBack={{@model.routeBack}}
    @routeBackUrl={{@model.routeBackUrl}}
  />
  {{outlet}}
</template> satisfies TOC<ProfileSignature>;
