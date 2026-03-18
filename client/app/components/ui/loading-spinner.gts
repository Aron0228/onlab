import type { TOC } from '@ember/component/template-only';

export interface UiLoadingSpinnerSignature {
  // The arguments accepted by the component
  Args: {
    backdrop?: boolean;
  };
  // Any blocks yielded by the component
  Blocks: {
    default: [];
  };
  // The element to which `...attributes` is applied in the component template
  Element: HTMLDivElement;
}

<template>
  <div
    class="ui-loading-spinner-wrapper {{if @backdrop '--backdrop' '--inline'}}"
    role="status"
    aria-label="Loading"
  >
    <div class="ui-loading-spinner" />
  </div>
</template> satisfies TOC<UiLoadingSpinnerSignature>;
