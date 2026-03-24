import type { TOC } from '@ember/component/template-only';
import UiLoadingSpinner from 'client/components/ui/loading-spinner';

<template>
  <aside class="route-workspaces-edit-issues-edit issue-edit-loading">
    <div class="issue-edit-loading__body">
      <UiLoadingSpinner />
    </div>
  </aside>
</template> satisfies TOC;
