import type { TOC } from '@ember/component/template-only';
import UiLoadingSpinner from 'client/components/ui/loading-spinner';
import type { EmptyArgs } from 'client/types/component';

type LoadingSignature = {
  Args: EmptyArgs;
  Blocks: {
    default: [];
  };
  Element: null;
};

<template>
  <aside class="route-workspaces-edit-issues-edit issue-edit-loading">
    <div class="issue-edit-loading__body">
      <UiLoadingSpinner />
    </div>
  </aside>
</template> satisfies TOC<LoadingSignature>;
