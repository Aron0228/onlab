import Component from '@glimmer/component';
import { inject as service } from '@ember/service';
import { task } from 'ember-concurrency';
import UiAvatar from 'client/components/ui/avatar';
import UiButton from 'client/components/ui/button';
import UiContainer from 'client/components/ui/container';
import UiIcon from 'client/components/ui/icon';
import type InvitationModel from 'client/models/invitation';

type ApiServiceLike = {
  request(
    path: string,
    options: {
      method: string;
      body?: unknown;
      params?: Record<string, string>;
    }
  ): Promise<unknown>;
};

type FlashMessagesServiceLike = {
  success(message: string, options?: { title?: string }): void;
  danger(message: string, options?: { title?: string }): void;
};

export interface RoutesWorkspacesIndexInvitationCardSignature {
  Args: {
    model: InvitationModel;
    memberCount: string;
    onChanged?: () => Promise<void> | void;
  };
  Blocks: {
    default: [];
  };
  Element: null;
}

export default class RoutesWorkspacesIndexInvitationCard extends Component<RoutesWorkspacesIndexInvitationCardSignature> {
  @service declare api: ApiServiceLike;
  @service declare flashMessages: FlashMessagesServiceLike;

  get workspace() {
    return this.args.model.workspace;
  }

  acceptInvitationTask = task(async () => {
    try {
      await this.api.request('/invitations/accept', {
        method: 'POST',
        body: {
          invitationId: Number(this.args.model.id),
        },
      });

      this.flashMessages.success('Invitation accepted successfully.', {
        title: 'Success',
      });

      await this.args.onChanged?.();
    } catch (error: unknown) {
      this.flashMessages.danger(
        error instanceof Error ? error.message : 'Failed to accept invitation.',
        {
          title: 'An error occured',
        }
      );
    }
  });

  declineInvitationTask = task(async () => {
    try {
      await this.api.request(`/invitations/${this.args.model.id}`, {
        method: 'DELETE',
      });

      this.flashMessages.success('Invitation declined successfully.', {
        title: 'Success',
      });

      await this.args.onChanged?.();
    } catch (error: unknown) {
      this.flashMessages.danger(
        error instanceof Error
          ? error.message
          : 'Failed to decline invitation.',
        {
          title: 'An error occured',
        }
      );
    }
  });

  <template>
    {{#if this.workspace}}
      <UiContainer @bordered={{true}}>
        <div class="layout-horizontal --gap-md">
          <UiAvatar @model={{this.workspace}} @squared={{true}} />
          <div class="layout-vertical --gap-sm">
            <h3 class="margin-zero">{{this.workspace.name}}</h3>

            <span
              class="layout-horizontal --gap-sm font-color-text-muted font-size-text-md"
            >
              <UiIcon @name="users" />
              {{@memberCount}}
            </span>
          </div>

          <div class="layout-horizontal --gap-sm margin-left-auto">
            <UiButton
              @text="Accept"
              @onClick={{this.acceptInvitationTask.perform}}
              @loading={{this.acceptInvitationTask.isRunning}}
              @disabled={{this.declineInvitationTask.isRunning}}
            />
            <UiButton
              @text="Decline"
              @hierarchy="secondary"
              @onClick={{this.declineInvitationTask.perform}}
              @loading={{this.declineInvitationTask.isRunning}}
              @disabled={{this.acceptInvitationTask.isRunning}}
            />
          </div>
        </div>
      </UiContainer>
    {{/if}}
  </template>
}
