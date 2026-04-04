import type { TOC } from '@ember/component/template-only';

export interface UiFormSignature {
  Args: {
    onSubmit?: (event: SubmitEvent) => void;
  };
  Blocks: {
    default: [];
  };
  Element: HTMLFormElement;
}

<template>
  <form class="layout-vertical --gap-md" ...attributes>
    {{yield}}
  </form>
</template> satisfies TOC<UiFormSignature>;
