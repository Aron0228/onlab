import {describe, expect, it, vi} from 'vitest';
import {NotificationController} from '../../../controllers/system/notification.controller';

describe('NotificationController (unit)', () => {
  const createSubject = () => {
    const notificationService = {
      findForUser: vi.fn(),
      countUnread: vi.fn(),
      markRead: vi.fn(),
      markAllRead: vi.fn(),
    };
    const authorization = {
      getAuthenticatedUserId: vi.fn().mockReturnValue(7),
    };

    return {
      notificationService,
      authorization,
      controller: new NotificationController(
        notificationService as never,
        authorization as never,
      ),
    };
  };

  it('lists current user notifications', async () => {
    const {controller, notificationService} = createSubject();
    const filter = {limit: 10};
    notificationService.findForUser.mockResolvedValue([{id: 1}]);

    await expect(controller.find({id: 7} as never, filter)).resolves.toEqual([
      {id: 1},
    ]);
    expect(notificationService.findForUser).toHaveBeenCalledWith(7, filter);
  });

  it('returns unread counts and marks notifications read', async () => {
    const {controller, notificationService} = createSubject();
    notificationService.countUnread.mockResolvedValue(3);
    notificationService.markRead.mockResolvedValue(undefined);
    notificationService.markAllRead.mockResolvedValue(undefined);

    await expect(controller.countUnread({id: 7} as never)).resolves.toEqual({
      count: 3,
    });
    await expect(
      controller.markRead({id: 7} as never, 12),
    ).resolves.toBeUndefined();
    await expect(
      controller.markAllRead({id: 7} as never),
    ).resolves.toBeUndefined();

    expect(notificationService.markRead).toHaveBeenCalledWith(7, 12);
    expect(notificationService.markAllRead).toHaveBeenCalledWith(7);
  });
});
