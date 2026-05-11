import type { TOC } from '@ember/component/template-only';
import { LinkTo } from '@ember/routing';
import UiButton from 'client/components/ui/button';
import UiContainer from 'client/components/ui/container';
import UiIcon from 'client/components/ui/icon';

interface RoutesWorkspacesEditAccessDeniedSignature {
  Args: object;
}

const RoutesWorkspacesEditAccessDenied = <template>
  <section class="workspace-access-denied">
    <UiContainer @bordered={{true}} class="access-denied-panel">
      <div class="access-denied-content layout-vertical --gap-lg">
        <div class="access-denied-icon">
          <UiIcon @name="lock" @size="xl" @variant="warning" />
        </div>

        <div class="layout-vertical --gap-sm">
          <h1 class="margin-zero">You cannot open this workspace area</h1>
          <p class="margin-zero font-color-text-secondary">
            This page is protected by workspace permissions. Nothing from the
            restricted route was loaded.
          </p>
        </div>

        <LinkTo @route="workspaces.index">
          <UiButton @text="Back to workspaces" @iconLeft="arrow-left" />
        </LinkTo>
      </div>
    </UiContainer>
  </section>
</template> satisfies TOC<RoutesWorkspacesEditAccessDeniedSignature>;

export default RoutesWorkspacesEditAccessDenied;
