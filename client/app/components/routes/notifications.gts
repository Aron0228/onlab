import Component from '@glimmer/component';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import UiIcon from 'client/components/ui/icon';
import UiIconButton from 'client/components/ui/icon-button';
import UiButton from 'client/components/ui/button';
import UiContainer from 'client/components/ui/container';
import UiThemeSwitcher from 'client/components/ui/theme-switcher';
import type RouterService from '@ember/routing/router-service';
import type ApiService from 'client/services/api';
import type { NotificationItem } from 'client/routes/notifications';

export interface RoutesNotificationsSignature {
  Args: {
    notifications: NotificationItem[];
  };
  Blocks: {
    default: [];
  };
  Element: null;
}

type NotificationGroup = {
  label: string;
  notifications: NotificationItem[];
};

export default class RoutesNotifications extends Component<RoutesNotificationsSignature> {
  @service declare api: ApiService;
  @service declare router: RouterService;

  @tracked notifications = [...this.args.notifications];

  get unreadCount(): number {
    return this.notifications.filter((notification) => !notification.readAt)
      .length;
  }

  get groupedNotifications(): NotificationGroup[] {
    const groups = new Map<string, NotificationItem[]>();

    for (const notification of this.notifications) {
      const label = this.dayLabel(notification.createdAt);
      groups.set(label, [...(groups.get(label) ?? []), notification]);
    }

    return [...groups.entries()].map(([label, notifications]) => ({
      label,
      notifications,
    }));
  }

  @action
  onBackClick(): void {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
      return;
    }

    void this.router.transitionTo('workspaces.index');
  }

  @action
  async openNotification(notification: NotificationItem): Promise<void> {
    await this.markRead(notification);

    if (notification.targetUrl) {
      globalThis.open?.(notification.targetUrl, '_blank', 'noopener');
      return;
    }

    if (notification.targetRoute === 'workspaces.edit.communication') {
      const workspaceId = Number(notification.payload.workspaceId);
      const channelId = Number(notification.payload.channelId);

      if (workspaceId && channelId) {
        void this.router.transitionTo(
          'workspaces.edit.communication',
          workspaceId,
          {
            queryParams: { channelId },
          }
        );
      }
      return;
    }

    if (notification.targetRoute === 'workspaces.edit.pull-requests.edit') {
      const workspaceId = Number(notification.payload.workspaceId);
      const pullRequestId = Number(notification.payload.pullRequestId);

      if (workspaceId && pullRequestId) {
        void this.router.transitionTo(
          'workspaces.edit.pull-requests.edit',
          workspaceId,
          pullRequestId
        );
      }
    }
  }

  @action
  async markAllRead(): Promise<void> {
    if (!this.unreadCount) return;

    await this.api.request('/notifications/read', { method: 'PATCH' });
    const readAt = new Date().toISOString();
    this.notifications = this.notifications.map((notification) => ({
      ...notification,
      readAt: notification.readAt ?? readAt,
    }));
  }

  async markRead(notification: NotificationItem): Promise<void> {
    if (notification.readAt) return;

    await this.api.request(`/notifications/${notification.id}/read`, {
      method: 'PATCH',
    });
    const readAt = new Date().toISOString();
    this.notifications = this.notifications.map((item) =>
      item.id === notification.id ? { ...item, readAt } : item
    );
  }

  iconFor = (notification: NotificationItem): string => {
    switch (notification.type) {
      case 'communication-message':
        return 'message-circle';
      case 'pull-request-review-reminder':
        return 'git-pull-request';
      default:
        return 'bell';
    }
  };

  timeFor = (date?: string): string => {
    if (!date) return '';

    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(date));
  };

  private dayLabel(date?: string): string {
    if (!date) return 'Earlier';

    const value = new Date(date);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (value.toDateString() === today.toDateString()) return 'Today';
    if (value.toDateString() === yesterday.toDateString()) return 'Yesterday';

    return new Intl.DateTimeFormat(undefined, {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(value);
  }

  <template>
    <div
      class="layout-vertical --max-height --overflow-y-auto route-notifications"
    >
      <div class="route-notifications__header">
        <div class="layout-horizontal --gap-md">
          <UiIconButton
            @iconName="arrow-narrow-left"
            @onClick={{this.onBackClick}}
            @iconSize="md"
            aria-label="Go back"
          />
          <div class="layout-vertical --gap-sm">
            <div class="layout-horizontal --gap-sm">
              <UiIcon @name="bell" @variant="primary" />
              <h2 class="margin-zero">Notifications</h2>
            </div>
            <span class="font-color-text-secondary font-size-text-sm">
              Review reminders and new chat messages
            </span>
          </div>
        </div>

        <div class="layout-horizontal --gap-md margin-left-auto">
          {{#if this.unreadCount}}
            <UiButton
              @text="Mark all read"
              @hierarchy="secondary"
              @onClick={{this.markAllRead}}
            />
          {{/if}}
          <UiThemeSwitcher />
        </div>
      </div>

      <div class="route-notifications__body layout-vertical --gap-xl">
        {{#if this.notifications.length}}
          {{#each this.groupedNotifications as |group|}}
            <section class="layout-vertical --gap-md">
              <div class="route-notifications__section-heading">
                <span>{{group.label}}</span>
                <hr class="separator --horizontal --feed" />
              </div>

              <UiContainer @bordered={{true}}>
                <div class="route-notifications__list layout-vertical">
                  {{#each group.notifications as |notification|}}
                    <button
                      type="button"
                      class="route-notifications__item
                        {{unless notification.readAt '--unread'}}"
                      {{on "click" (fn this.openNotification notification)}}
                    >
                      <span class="route-notifications__item-icon">
                        <UiIcon
                          @name={{this.iconFor notification}}
                          @variant={{if
                            notification.readAt
                            "secondary"
                            "primary"
                          }}
                        />
                      </span>

                      <span class="route-notifications__item-copy">
                        <span class="route-notifications__item-title">
                          {{notification.title}}
                        </span>
                        <span class="route-notifications__item-message">
                          {{notification.message}}
                        </span>
                      </span>

                      <span class="route-notifications__item-meta">
                        {{this.timeFor notification.createdAt}}
                      </span>
                    </button>
                  {{/each}}
                </div>
              </UiContainer>
            </section>
          {{/each}}
        {{else}}
          <UiContainer @bordered={{true}} class="route-notifications__empty">
            <UiIcon @name="bell-off" @size="xl" @variant="secondary" />
            <h3 class="margin-zero">No notifications yet</h3>
            <p class="margin-zero font-color-text-secondary">
              Review reminders and chat messages will appear here.
            </p>
          </UiContainer>
        {{/if}}
      </div>
    </div>
  </template>
}
