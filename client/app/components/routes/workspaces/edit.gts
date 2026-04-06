import Component from '@glimmer/component';
import UiIconButton from 'client/components/ui/icon-button';
import UiAvatar from 'client/components/ui/avatar';
import UiIcon from 'client/components/ui/icon';
import RoutesWorkspacesHeaderActions from 'client/components/routes/workspaces/header-actions';
import { LinkTo } from '@ember/routing';
import { on } from '@ember/modifier';
import { tracked } from '@glimmer/tracking';
import type WorkspaceModel from 'client/models/workspace';
import type GithubRepositoryModel from 'client/models/github-repository';
import type Owner from '@ember/owner';

type WorkspacesEditModel = {
  workspace: WorkspaceModel;
  repositories: GithubRepositoryModel[];
};

const SEPARATOR = {
  separator: true,
} as const;

export interface RoutesWorkspacesEditSignature {
  // The arguments accepted by the component
  Args: {
    model: WorkspacesEditModel;
  };
  // Any blocks yielded by the component
  Blocks: {
    default: [];
  };
  // The element to which `...attributes` is applied in the component template
  Element: null;
}

export default class RoutesWorkspacesEdit extends Component<RoutesWorkspacesEditSignature> {
  @tracked isCollapsed = false;

  constructor(owner: Owner, args: RoutesWorkspacesEditSignature['Args']) {
    super(owner, args);

    if (globalThis.matchMedia?.('(max-width: 768px)').matches) {
      this.isCollapsed = true;
    }
  }

  get bodyClass() {
    return `body${this.isCollapsed ? ' --collapsed' : ''}`;
  }

  get menuItems() {
    return [
      {
        iconName: 'exclamation-circle',
        name: 'Issues',
        route: 'workspaces.edit.issues',
      },
      {
        iconName: 'git-pull-request',
        name: 'Pull Requests',
        route: 'workspaces.edit.pull-requests',
      },
      SEPARATOR,
      {
        iconName: 'settings',
        name: 'Settings',
        route: 'workspaces.edit.settings',
      },
    ];
  }

  onCollapseIconClick = () => {
    this.isCollapsed = !this.isCollapsed;
  };

  onNavItemClick = () => {
    this.isCollapsed = true;
  };

  <template>
    <div class="layout-vertical --max-height route-workspaces-edit">
      <div class={{this.bodyClass}}>
        <div class="workspace-summary layout-horizontal --gap-md">
          <div class="workspace-summary__identity layout-horizontal --gap-md">
            <UiAvatar
              @model={{@model.workspace}}
              @squared={{true}}
              @size="sm"
            />

            <div class="workspace-summary__content layout-vertical --gap-sm">
              <h3 class="margin-zero">{{@model.workspace.name}}</h3>
            </div>
          </div>

          <UiIconButton
            class="mobile-nav-collapse"
            @iconName="x"
            @onClick={{this.onCollapseIconClick}}
            aria-label="Close navigation"
          />
        </div>

        <div class="workspace-header-panel">
          {{#if this.isCollapsed}}
            <UiIconButton
              class="mobile-nav-toggle"
              @iconName="menu"
              @onClick={{this.onCollapseIconClick}}
              aria-label="Open navigation"
            />
          {{/if}}
          <div
            class="workspace-header-panel__workspace layout-horizontal --gap-md"
          >
            <RoutesWorkspacesHeaderActions />
          </div>
        </div>

        <div class="workspace-nav layout-vertical --gap-sm">
          {{#each this.menuItems as |menuItem|}}
            {{#if menuItem.separator}}
              <hr class="separator --horizontal --menu" />
            {{else}}
              <LinkTo
                @route={{menuItem.route}}
                class="nav-item layout-horizontal --gap-sm"
                {{on "click" this.onNavItemClick}}
              >
                <UiIcon @name={{menuItem.iconName}} />
                <span>{{menuItem.name}}</span>
              </LinkTo>
            {{/if}}
          {{/each}}
        </div>
        <div class="workspace-content-panel">
          {{yield}}
        </div>
      </div>
    </div>
  </template>
}
