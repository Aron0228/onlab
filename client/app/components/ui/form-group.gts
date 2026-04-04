import type { TOC } from '@ember/component/template-only';

export interface UiFormGroupSignature {
  Args: {
    label: string;
    required?: boolean;
    trailingText?: string;
  };
  Blocks: {
    default: [];
  };
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
