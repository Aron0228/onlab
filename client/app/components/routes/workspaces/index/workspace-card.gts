import Component from '@glimmer/component';
import { LinkTo } from '@ember/routing';
import UiAvatar from 'client/components/ui/avatar';
import UiContainer from 'client/components/ui/container';
import UiIcon from 'client/components/ui/icon';
import type WorkspaceModel from 'client/models/workspace';

export interface RoutesWorkspacesIndexWorkspaceCardSignature {
  Args: {
    model: WorkspaceModel;
    memberCount: string;
    role?: 'MEMBER' | 'ADMIN' | 'OWNER';
  };
  Blocks: {
    default: [];
  };
  Element: null;
}

export default class RoutesWorkspacesIndexWorkspaceCard extends Component<RoutesWorkspacesIndexWorkspaceCardSignature> {
  get roleClass() {
    return this.args.role?.toLowerCase();
  }

  <template>
    <LinkTo @route="workspaces.edit" @model={{@model.id}}>
      <UiContainer @bordered={{true}} class="layout-horizontal --gap-md">
        <UiAvatar @model={{@model}} @squared={{true}} />
        <div class="layout-vertical --gap-sm">
          <h3 class="margin-zero">{{@model.name}}</h3>

          <span
            class="layout-horizontal --gap-sm font-color-text-muted font-size-text-md"
          >
            <UiIcon @name="users" />
            {{@memberCount}}
          </span>
        </div>

        {{#if @role}}
          <div class="layout-horizontal --gap-sm margin-left-auto">
            <div class="workspace-role --{{this.roleClass}}">{{@role}}</div>
          </div>
        {{/if}}
      </UiContainer>
    </LinkTo>
  </template>
}
