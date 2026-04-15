import type { TOC } from '@ember/component/template-only';

interface CapacityPlanningLayoutSignature {
  Args: {
    model: unknown;
    controller: unknown;
  };
}

<template>{{outlet}}</template> satisfies TOC<CapacityPlanningLayoutSignature>;
