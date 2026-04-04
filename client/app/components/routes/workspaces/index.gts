import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import UiIcon from 'client/components/ui/icon';
import { task } from 'ember-concurrency';
import { inject as service } from '@ember/service';
import { LinkTo } from '@ember/routing';
import UiLoadingSpinner from 'client/components/ui/loading-spinner';
import type InvitationModel from 'client/models/invitation';
import type WorkspaceModel from 'client/models/workspace';
import type WorkspaceMemberModel from 'client/models/workspace-member';
import { task as trackedTask } from 'reactiveweb/ember-concurrency';
import { or } from 'ember-truth-helpers';
import type User from 'client/models/user';
import RoutesWorkspacesIndexInvitationCard from 'client/components/routes/workspaces/index/invitation-card';
import RoutesWorkspacesIndexWorkspaceCard from 'client/components/routes/workspaces/index/workspace-card';
import RoutesWorkspacesHeaderActions from 'client/components/routes/workspaces/header-actions';
import type { EmptyArgs } from 'client/types/component';
import type { ApiServiceLike } from 'client/types/services';

type SessionAccountServiceLike = {
  id?: number;
  user?: User | null;
};

type WorkspaceCountResponse = {
  count: number;
};

type WorkspaceRole = 'MEMBER' | 'ADMIN' | 'OWNER';

type StoreLike = {
  query(
    modelName: 'workspace',
    query: Record<string, unknown>
  ): Promise<WorkspaceModel[]>;
  query(
    modelName: 'workspace-member',
    query: Record<string, unknown>
  ): Promise<WorkspaceMemberModel[]>;
  query(
    modelName: 'invitation',
    query: Record<string, unknown>
  ): Promise<InvitationModel[]>;
};

export interface RoutesWorkspacesIndexSignature {
  Args: EmptyArgs;
  Blocks: {
    default: [];
  };
  Element: null;
}

export default class RoutesWorkspacesIndex extends Component<RoutesWorkspacesIndexSignature> {
  @service declare sessionAccount: SessionAccountServiceLike;
  @service declare store: StoreLike;
  @service declare api: ApiServiceLike;

  @tracked workspaceMemberCounts: Record<number, number> = {};
  @tracked workspaceRoles: Record<number, WorkspaceRole> = {};
  @tracked invitationRefreshKey = 0;

  fetchOwnWorkspacesTask = task(async () => {
    const userId = this.sessionAccount.id;

    const workspaces = await this.store.query('workspace', {
      filter: {
        where: {
          ownerId: userId,
        },
      },
    });

    await Promise.all(
      workspaces.map(async (workspace) => {
        const count = await this.fetchWorkspaceMemberCountTask.perform(
          Number(workspace.id)
        );

        this.workspaceMemberCounts = {
          ...this.workspaceMemberCounts,
          [Number(workspace.id)]: count,
        };
      })
    );

    return workspaces;
  });

  fetchMemberWorkspaceTask = task(async () => {
    const userId = this.sessionAccount.id;

    const workspaceMembers = await this.store.query('workspace-member', {
      filter: {
        where: {
          userId: userId,
        },
        include: ['workspace'],
      },
    });

    const workspaces = workspaceMembers
      .map((workspaceMember) => workspaceMember.workspace)
      .filter((workspace): workspace is WorkspaceModel => Boolean(workspace));

    await Promise.all(
      workspaces.map(async (workspace) => {
        const count = await this.fetchWorkspaceMemberCountTask.perform(
          Number(workspace.id)
        );

        this.workspaceMemberCounts = {
          ...this.workspaceMemberCounts,
          [Number(workspace.id)]: count,
        };
      })
    );

    workspaceMembers.forEach((workspaceMember) => {
      const workspaceId = Number(workspaceMember.workspace?.id);
      const role = workspaceMember.role as WorkspaceRole | undefined;

      if (!workspaceId || !role) {
        return;
      }

      this.workspaceRoles = {
        ...this.workspaceRoles,
        [workspaceId]: role,
      };
    });

    return workspaces;
  });

  fetchWorkspaceMemberCountTask = task(async (workspaceId: number) => {
    const where = JSON.stringify({ workspaceId });
    const params = {
      where,
    };
    const result = await this.api.request<WorkspaceCountResponse>(
      '/workspaceMembers/count',
      {
        method: 'GET',
        params,
      }
    );

    // + 1 since the workspace owner is not in the WorkspaceMembers model
    return result.count + 1;
  });

  fetchInvitationsTask = task(async () => {
    const userEmail = this.sessionAccount.user?.email;

    const invitations = await this.store.query('invitation', {
      filter: {
        where: {
          email: userEmail,
        },
        include: ['workspace'],
      },
    });

    await Promise.all(
      invitations.map(async (invitation) => {
        const workspaceId = Number(invitation.workspace?.id);

        if (!workspaceId) {
          return;
        }

        const count =
          await this.fetchWorkspaceMemberCountTask.perform(workspaceId);

        this.workspaceMemberCounts = {
          ...this.workspaceMemberCounts,
          [workspaceId]: count,
        };
      })
    );

    return invitations;
  });

  lastOwnWorkspaces = trackedTask(this, this.fetchOwnWorkspacesTask, () => []);

  lastMemberWorkspaces = trackedTask(
    this,
    this.fetchMemberWorkspaceTask,
    () => [this.invitationRefreshKey]
  );

  lastInvitations = trackedTask(this, this.fetchInvitationsTask, () => [
    this.invitationRefreshKey,
  ]);

  get ownWorkspaces(): WorkspaceModel[] {
    return (this.lastOwnWorkspaces.value as WorkspaceModel[] | undefined) ?? [];
  }

  get memberWorkspaces(): WorkspaceModel[] {
    return (
      (this.lastMemberWorkspaces.value as WorkspaceModel[] | undefined) ?? []
    );
  }

  get invitations(): InvitationModel[] {
    return (this.lastInvitations.value as InvitationModel[] | undefined) ?? [];
  }

  refreshInvitationData = (): Promise<void> => {
    this.invitationRefreshKey += 1;
    return Promise.resolve();
  };

  workspaceMemberCount = (workspaceId: number): string => {
    const count = this.workspaceMemberCounts[workspaceId];

    if (count === undefined) {
      return '...';
    }

    return `${count} member${count === 1 ? '' : 's'}`;
  };

  workspaceRole = (workspaceId: number, toLowerCase?: boolean): string => {
    const role = this.workspaceRoles[workspaceId] ?? 'MEMBER';

    return toLowerCase ? role.toLowerCase() : role;
  };

  workspaceIdValue = (
    workspaceId: string | number | null | undefined
  ): number => {
    return Number(workspaceId ?? 0);
  };

  workspaceRoleValue = (
    workspaceId: string | number | null | undefined
  ): WorkspaceRole => {
    return this.workspaceRole(
      this.workspaceIdValue(workspaceId)
    ) as WorkspaceRole;
  };

  <template>
    <div
      class="layout-vertical --max-height --overflow-y-auto route-workspaces-index"
    >
      <div class="header">
        <div class="layout-horizontal --gap-xl">
          <UiIcon @name="app-logo" @size="lg" @custom={{true}} />
          <h1>Workspaces</h1>
        </div>
        <RoutesWorkspacesHeaderActions />
      </div>
      <div class="body layout-vertical --gap-xl">
        {{#if
          (or
            this.lastOwnWorkspaces.isRunning
            this.lastMemberWorkspaces.isRunning
            this.lastInvitations.isRunning
          )
        }}
          <UiLoadingSpinner @backdrop={{true}} />
        {{else}}
          <div class="layout-vertical --gap-sm">
            {{#if this.invitations.length}}
              <h2>Invitations</h2>
              {{#each this.invitations as |invitation|}}
                <RoutesWorkspacesIndexInvitationCard
                  @model={{invitation}}
                  @memberCount={{this.workspaceMemberCount
                    (or invitation.workspaceId 0)
                  }}
                  @onChanged={{this.refreshInvitationData}}
                />
              {{/each}}
            {{/if}}
            {{#if (or this.ownWorkspaces.length this.memberWorkspaces.length)}}
              <h2>Your Workspaces</h2>
              <div class="layout-vertical --gap-sm">
                {{! Own }}
                {{#each this.ownWorkspaces as |workspace|}}
                  <RoutesWorkspacesIndexWorkspaceCard
                    @model={{workspace}}
                    @memberCount={{this.workspaceMemberCount
                      (this.workspaceIdValue workspace.id)
                    }}
                    @role="OWNER"
                  />
                {{/each}}

                {{! Member}}
                {{#each this.memberWorkspaces as |workspace|}}
                  <RoutesWorkspacesIndexWorkspaceCard
                    @model={{workspace}}
                    @memberCount={{this.workspaceMemberCount
                      (this.workspaceIdValue workspace.id)
                    }}
                    @role={{this.workspaceRoleValue workspace.id}}
                  />
                {{/each}}
              </div>
            {{/if}}
          </div>

          {{! New }}
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
        {{/if}}
      </div>
    </div>
  </template>
}
