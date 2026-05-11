import type { TOC } from '@ember/component/template-only';
import { LinkTo } from '@ember/routing';
import UiButton from 'client/components/ui/button';
import UiContainer from 'client/components/ui/container';
import UiIcon from 'client/components/ui/icon';

interface RoutesAccessDeniedSignature {
  Args: object;
}

const RoutesAccessDenied = <template>
  <main class="route-access-denied">
    <UiContainer @bordered={{true}} class="access-denied-panel">
      <div class="access-denied-content layout-vertical --gap-lg">
        <div class="access-denied-icon">
          <UiIcon @name="lock" @size="xl" @variant="warning" />
        </div>

        <div class="layout-vertical --gap-sm">
          <h1 class="margin-zero">Access denied</h1>
          <p class="margin-zero font-color-text-secondary">
            You do not have permission to view this area. Ask a workspace owner
            or admin if you need access.
          </p>
        </div>

        <LinkTo @route="workspaces.index">
          <UiButton @text="Back to workspaces" @iconLeft="arrow-left" />
        </LinkTo>
      </div>
    </UiContainer>
  </main>
</template> satisfies TOC<RoutesAccessDeniedSignature>;

export default RoutesAccessDenied;
