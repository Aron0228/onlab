import Component from '@glimmer/component';
import UiThemeSwitcher from 'client/components/ui/theme-switcher';
import UiIcon from 'client/components/ui/icon';
import { task } from 'ember-concurrency';
import { inject as service } from '@ember/service';
import { on } from '@ember/modifier';
import { LinkTo } from '@ember/routing';

export interface RoutesWorkspacesIndexSignature {
  // The arguments accepted by the component
  Args: {};
  // Any blocks yielded by the component
  Blocks: {
    default: [];
  };
  // The element to which `...attributes` is applied in the component template
  Element: null;
}

export default class RoutesWorkspacesIndex extends Component<RoutesWorkspacesIndexSignature> {
  @service sessionAccount;
  @service store;

  constructor(owner: unknown, args: unknown) {
    super(owner, args);

    this.fetchOwnWorkspacesTask.perform().catch(console.error);
  }

  fetchOwnWorkspacesTask = task(async () => {
    const userId = this.sessionAccount.id;

    const workspaces = await this.store.query('workspace', {
      filter: {
        where: {
          ownerId: userId,
        },
      },
    });
  });

  <template>
    <div class="layout-vertical --max-height route-workspaces-index">
      <div class="header">
        <div class="layout-horizontal --gap-xl">
          <UiIcon @name="app-logo" @size="lg" @custom={{true}} />
          <h1>Workspaces</h1>
        </div>
        <UiThemeSwitcher />
      </div>
      <div class="body">
        <LinkTo @route="workspaces.new">
          <div class="new-workspace layout-horizontal --gap-md">
            <div class="plus-button-wrapper">
              <UiIcon @name="plus" />
            </div>
            <div class="layout-vertical --gap-xs">
              <h3 class="margin-zero">Create Your Own Workspace</h3>
              <span class="font-color-text-muted font-size-text-sm">
                Start fresh with a new workspace
              </span>
            </div>

            <UiIcon @name="arrow-narrow-right" class="margin-left-auto" />
          </div>
        </LinkTo>
      </div>
    </div>
  </template>
}
