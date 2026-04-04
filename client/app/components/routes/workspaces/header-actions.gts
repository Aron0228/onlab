import type { TOC } from '@ember/component/template-only';
import UiThemeSwitcher from 'client/components/ui/theme-switcher';
import RouteProfile from 'client/components/route-profile';
import UiLanguageSelector from 'client/components/ui/language-selector';
import type { EmptyArgs } from 'client/types/component';

export interface RoutesWorkspacesHeaderActionsSignature {
  Args: EmptyArgs;
  Blocks: {
    default: [];
  };
  Element: HTMLDivElement;
}

<template>
  <div class="layout-horizontal --gap-md margin-left-auto">
    <UiLanguageSelector />
    <UiThemeSwitcher />
    <hr class="separator --vertical" />
    <RouteProfile />
  </div>
</template> satisfies TOC<RoutesWorkspacesHeaderActionsSignature>;
