import {authenticate} from '@loopback/authentication';
import {inject, intercept, service} from '@loopback/core';
import {Filter} from '@loopback/repository';
import {get, param, patch} from '@loopback/rest';
import {SecurityBindings, UserProfile} from '@loopback/security';
import {Notification} from '../../models';
import {
  NotificationService,
  WorkspaceAuthorizationService,
} from '../../services';

@authenticate('jwt-header')
export class NotificationController {
  constructor(
    @service(NotificationService)
    private notificationService: NotificationService,
    @service(WorkspaceAuthorizationService)
    private workspaceAuthorizationService: WorkspaceAuthorizationService,
  ) {}

  @get('/notifications')
  @intercept('interceptors.json-api-serializer')
  async find(
    @inject(SecurityBindings.USER) userProfile: UserProfile,
    @param.query.object('filter') filter?: Filter<Notification>,
  ): Promise<Notification[]> {
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);

    return this.notificationService.findForUser(userId, filter);
  }

  @get('/notifications/unread/count')
  async countUnread(
    @inject(SecurityBindings.USER) userProfile: UserProfile,
  ): Promise<{count: number}> {
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);

    return {count: await this.notificationService.countUnread(userId)};
  }

  @patch('/notifications/{id}/read')
  async markRead(
    @inject(SecurityBindings.USER) userProfile: UserProfile,
    @param.path.number('id') id: number,
  ): Promise<void> {
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);

    await this.notificationService.markRead(userId, id);
  }

  @patch('/notifications/read')
  async markAllRead(
    @inject(SecurityBindings.USER) userProfile: UserProfile,
  ): Promise<void> {
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);

    await this.notificationService.markAllRead(userId);
  }
}
