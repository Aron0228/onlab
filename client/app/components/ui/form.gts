import type { TOC } from '@ember/component/template-only';

export interface UiFormSignature {
  // The arguments accepted by the component
  Args: {};
  // Any blocks yielded by the component
  Blocks: {
    default: [];
  };
  // The element to which `...attributes` is applied in the component template
  Element: HtmlFormElement;
}

<template>
  <form class="layout-vertical --gap-md" ...attributes>
    {{yield}}
  </form>
</template> satisfies TOC<UiFormSignature>;
