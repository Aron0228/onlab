import {BindingScope, injectable} from '@loopback/core';
import {DataObject, Filter, repository, Where} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {Notification} from '../models';
import {NotificationRepository} from '../repositories';

export type CreateNotificationInput = Omit<
  DataObject<Notification>,
  'id' | 'createdAt' | 'readAt'
>;

@injectable({scope: BindingScope.SINGLETON})
export class NotificationService {
  constructor(
    @repository(NotificationRepository)
    private notificationRepository: NotificationRepository,
  ) {}

  async create(input: CreateNotificationInput): Promise<Notification> {
    return this.notificationRepository.create({
      ...input,
      payload: input.payload ?? {},
      createdAt: new Date().toISOString(),
    });
  }

  async findForUser(
    userId: number,
    filter: Filter<Notification> = {},
  ): Promise<Notification[]> {
    return this.notificationRepository.find({
      ...filter,
      where: {
        ...(filter.where ?? {}),
        userId,
      },
      order: filter.order ?? ['createdAt DESC'],
    });
  }

  async countUnread(userId: number): Promise<number> {
    const result = await this.notificationRepository.count({
      userId,
      readAt: null,
    } as unknown as Where<Notification>);

    return result.count;
  }

  async markRead(userId: number, notificationId: number): Promise<void> {
    const notification =
      await this.notificationRepository.findById(notificationId);

    if (notification.userId !== userId) {
      throw new HttpErrors.Forbidden('You cannot update this notification.');
    }

    if (notification.readAt) return;

    await this.notificationRepository.updateById(notificationId, {
      readAt: new Date().toISOString(),
    });
  }

  async markAllRead(userId: number): Promise<void> {
    await this.notificationRepository.updateAll(
      {readAt: new Date().toISOString()},
      {userId, readAt: null} as unknown as Where<Notification>,
    );
  }
}
