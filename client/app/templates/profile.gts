import type { TOC } from '@ember/component/template-only';
import { pageTitle } from 'ember-page-title';
import RoutesProfile from 'client/components/routes/profile';

interface ProfileSignature {
  Args: {
    model: {
      routeBack: string;
    };
    controller: unknown;
  };
}

<template>
  {{pageTitle "Profile"}}
  <RoutesProfile @routeBack={{@model.routeBack}} />
  {{outlet}}
</template> satisfies TOC<ProfileSignature>;
