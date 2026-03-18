import type { TOC } from '@ember/component/template-only';

export interface UiFormGroupSignature {
  // The arguments accepted by the component
  Args: {};
  // Any blocks yielded by the component
  Blocks: {
    default: [];
  };
  // The element to which `...attributes` is applied in the component template
  Element: null;
}

<template>
  <div class="layout-vertical --gap-xs">
    {{#if @required}}
      <div class="layout-horizontal">
        <span class="font-weight-bold">{{@label}}</span>
        <span class="font-weight-bold color-error">*</span>
      </div>
    {{else}}
      <span class="font-weight-bold">{{@label}}</span>
    {{/if}}
    {{yield}}
    {{#if @trailingText}}
      {{@trailingText}}
    {{/if}}
  </div>
</template> satisfies TOC<UiFormGroupSignature>;
