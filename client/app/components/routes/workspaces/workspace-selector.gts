import Component from '@glimmer/component';
import { action } from '@ember/object';
import { fn } from '@ember/helper';
import { registerDestructor } from '@ember/destroyable';
import { service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { or } from 'ember-truth-helpers';
import type Owner from '@ember/owner';
import type RouterService from '@ember/routing/router-service';
import UiAvatar from 'client/components/ui/avatar';
import UiIcon from 'client/components/ui/icon';
import UiLoadingSpinner from 'client/components/ui/loading-spinner';
import type WorkspaceModel from 'client/models/workspace';
import type WorkspaceMemberModel from 'client/models/workspace-member';
import type { ApiServiceLike } from 'client/types/services';

type WorkspaceRole = 'MEMBER' | 'ADMIN' | 'OWNER';

type SessionAccountServiceLike = {
  id?: number;
};

type WorkspaceCountResponse = {
  count: number;
};

type StoreLike = {
  query(
    modelName: 'workspace',
    query: Record<string, unknown>
  ): Promise<WorkspaceModel[]>;
  query(
    modelName: 'workspace-member',
    query: Record<string, unknown>
  ): Promise<WorkspaceMemberModel[]>;
};

type WorkspaceSelectorItem = {
  workspace: WorkspaceModel;
  role: WorkspaceRole;
  memberCount?: string;
};

export interface RoutesWorkspacesWorkspaceSelectorSignature {
  Args: {
    workspace: WorkspaceModel;
  };
  Blocks: {
    default: [];
  };
  Element: HTMLDivElement;
}

export default class RoutesWorkspacesWorkspaceSelector extends Component<RoutesWorkspacesWorkspaceSelectorSignature> {
  @service declare api: ApiServiceLike;
  @service declare router: RouterService;
  @service declare sessionAccount: SessionAccountServiceLike;
  @service declare store: StoreLike;

  @tracked isOpen = false;
  @tracked isLoading = false;
  @tracked workspaceItems: WorkspaceSelectorItem[] = [];
  @tracked errorMessage: string | null = null;

  constructor(
    owner: Owner,
    args: RoutesWorkspacesWorkspaceSelectorSignature['Args']
  ) {
    super(owner, args);

    document.addEventListener('click', this.closeOnOutsideClick);
    registerDestructor(this, () => {
      document.removeEventListener('click', this.closeOnOutsideClick);
    });
  }

  get currentWorkspace(): WorkspaceModel {
    return this.args.workspace;
  }

  get currentWorkspaceSlug(): string {
    return this.workspaceSlug(this.currentWorkspace);
  }

  get hasOtherWorkspaces(): boolean {
    return this.workspaceItems.some(
      (item) => Number(item.workspace.id) !== Number(this.currentWorkspace.id)
    );
  }

  get selectorItems(): WorkspaceSelectorItem[] {
    if (this.workspaceItems.length) {
      return this.workspaceItems;
    }

    return [
      {
        workspace: this.currentWorkspace,
        role: 'OWNER',
      },
    ];
  }

  workspaceSlug = (workspace: WorkspaceModel): string => {
    return workspace.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  };

  isCurrentWorkspace = (workspace: WorkspaceModel): boolean => {
    return Number(workspace.id) === Number(this.currentWorkspace.id);
  };

  private closeOnOutsideClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null;

    if (!target?.closest('.workspace-selector')) {
      this.isOpen = false;
    }
  };

  private async loadWorkspaces(): Promise<void> {
    if (this.isLoading || this.workspaceItems.length) {
      return;
    }

    this.isLoading = true;
    this.errorMessage = null;

    try {
      const userId = this.sessionAccount.id;
      const ownedWorkspaces = await this.store.query('workspace', {
        filter: {
          where: {
            ownerId: userId,
          },
          order: ['name ASC'],
        },
      });
      const workspaceMembers = await this.store.query('workspace-member', {
        filter: {
          where: {
            userId,
          },
          include: ['workspace'],
        },
      });
      const itemsByWorkspaceId = new Map<number, WorkspaceSelectorItem>();

      ownedWorkspaces.forEach((workspace) => {
        itemsByWorkspaceId.set(Number(workspace.id), {
          workspace,
          role: 'OWNER',
        });
      });

      workspaceMembers.forEach((workspaceMember) => {
        const workspace = workspaceMember.workspace;
        const workspaceId = Number(workspace?.id);

        if (!workspace || !workspaceId || itemsByWorkspaceId.has(workspaceId)) {
          return;
        }

        itemsByWorkspaceId.set(workspaceId, {
          workspace,
          role: (workspaceMember.role as WorkspaceRole | undefined) ?? 'MEMBER',
        });
      });

      if (!itemsByWorkspaceId.has(Number(this.currentWorkspace.id))) {
        itemsByWorkspaceId.set(Number(this.currentWorkspace.id), {
          workspace: this.currentWorkspace,
          role: 'MEMBER',
        });
      }

      const items = Array.from(itemsByWorkspaceId.values()).sort((a, b) =>
        a.workspace.name.localeCompare(b.workspace.name)
      );

      await Promise.all(
        items.map(async (item) => {
          item.memberCount = await this.fetchWorkspaceMemberCount(
            Number(item.workspace.id)
          );
        })
      );

      this.workspaceItems = items;
    } catch {
      this.errorMessage = 'Workspaces could not be loaded.';
    } finally {
      this.isLoading = false;
    }
  }

  private async fetchWorkspaceMemberCount(
    workspaceId: number
  ): Promise<string> {
    const result = await this.api.request<WorkspaceCountResponse>(
      '/workspaceMembers/count',
      {
        method: 'GET',
        params: {
          where: JSON.stringify({ workspaceId }),
        },
      }
    );
    const count = result.count + 1;

    return `${count} member${count === 1 ? '' : 's'}`;
  }

  @action
  toggleSelector(event: Event): void {
    event.stopPropagation();
    this.isOpen = !this.isOpen;

    if (this.isOpen) {
      void this.loadWorkspaces();
    }
  }

  @action
  selectWorkspace(workspace: WorkspaceModel): void {
    this.isOpen = false;

    if (this.isCurrentWorkspace(workspace)) {
      return;
    }

    void this.router.transitionTo(
      'workspaces.edit.news-feed',
      Number(workspace.id)
    );
  }

  @action
  createWorkspace(): void {
    this.isOpen = false;
    void this.router.transitionTo('workspaces.new');
  }

  <template>
    <div class="workspace-selector" ...attributes>
      <button
        type="button"
        class="workspace-selector__trigger"
        aria-haspopup="menu"
        aria-expanded={{if this.isOpen "true" "false"}}
        {{on "click" this.toggleSelector}}
      >
        <UiIcon @name="building-community" @variant="primary" />
        <span class="workspace-selector__trigger-copy">
          <strong>{{this.currentWorkspace.name}}</strong>
          <small>{{this.currentWorkspaceSlug}}</small>
        </span>
        <UiIcon
          class="workspace-selector__chevron {{if this.isOpen '--open'}}"
          @name="chevron-down"
          @size="sm"
        />
      </button>

      {{#if this.isOpen}}
        <div class="workspace-selector__menu" role="menu">
          <div class="workspace-selector__menu-header">
            <span>Switch workspace</span>
          </div>

          {{#if this.isLoading}}
            <div class="workspace-selector__loading">
              <UiLoadingSpinner />
            </div>
          {{else if this.errorMessage}}
            <p class="workspace-selector__empty margin-zero">
              {{this.errorMessage}}
            </p>
          {{else}}
            <div class="workspace-selector__list" role="group">
              {{#each this.selectorItems as |item|}}
                <button
                  type="button"
                  class="workspace-selector__item
                    {{if (this.isCurrentWorkspace item.workspace) '--active'}}"
                  role="menuitem"
                  {{on "click" (fn this.selectWorkspace item.workspace)}}
                >
                  <UiAvatar
                    @model={{item.workspace}}
                    @squared={{true}}
                    @size="sm"
                  />
                  <span class="workspace-selector__item-copy">
                    <strong>{{item.workspace.name}}</strong>
                    <small>
                      {{or item.memberCount "..."}}
                      ·
                      {{item.role}}
                    </small>
                  </span>
                  {{#if (this.isCurrentWorkspace item.workspace)}}
                    <UiIcon @name="circle-check" @variant="primary" />
                  {{/if}}
                </button>
              {{/each}}
            </div>

            {{#unless this.hasOtherWorkspaces}}
              <p class="workspace-selector__empty margin-zero">
                This is your only workspace for now.
              </p>
            {{/unless}}
          {{/if}}

          <button
            type="button"
            class="workspace-selector__create"
            role="menuitem"
            {{on "click" this.createWorkspace}}
          >
            <span class="workspace-selector__create-icon">
              <UiIcon @name="plus" />
            </span>
            <span class="workspace-selector__item-copy">
              <strong>Create workspace</strong>
              <small>Start a new team space</small>
            </span>
          </button>
        </div>
      {{/if}}
    </div>
  </template>
}
