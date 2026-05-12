import {describe, expect, it, vi} from 'vitest';
import {HttpErrors} from '@loopback/rest';
import {NotificationService} from '../../../services/notification.service';

describe('NotificationService (unit)', () => {
  const createSubject = () => {
    const repository = {
      create: vi.fn(),
      find: vi.fn(),
      count: vi.fn(),
      findById: vi.fn(),
      updateById: vi.fn(),
      updateAll: vi.fn(),
    };

    return {
      repository,
      service: new NotificationService(repository as never),
    };
  };

  it('creates notifications with default payload and timestamp', async () => {
    const {service, repository} = createSubject();
    repository.create.mockImplementation(async value => value);

    const notification = await service.create({
      userId: 3,
      workspaceId: 4,
      type: 'communication-message',
      title: 'New message',
      message: 'Hello',
    });

    expect(notification).toEqual(
      expect.objectContaining({
        userId: 3,
        workspaceId: 4,
        type: 'communication-message',
        payload: {},
        createdAt: expect.any(String),
      }),
    );
  });

  it('scopes finds and unread counts to the authenticated user', async () => {
    const {service, repository} = createSubject();
    repository.find.mockResolvedValue([{id: 1}]);
    repository.count.mockResolvedValue({count: 2});

    await expect(
      service.findForUser(3, {where: {type: 'communication-message'}}),
    ).resolves.toEqual([{id: 1}]);
    await expect(service.countUnread(3)).resolves.toBe(2);

    expect(repository.find).toHaveBeenCalledWith({
      where: {type: 'communication-message', userId: 3},
      order: ['createdAt DESC'],
    });
    expect(repository.count).toHaveBeenCalledWith({userId: 3, readAt: null});
  });

  it('marks owned notifications read and rejects foreign notifications', async () => {
    const {service, repository} = createSubject();
    repository.findById.mockResolvedValueOnce({id: 8, userId: 3});
    repository.updateById.mockResolvedValue(undefined);

    await expect(service.markRead(3, 8)).resolves.toBeUndefined();
    expect(repository.updateById).toHaveBeenCalledWith(8, {
      readAt: expect.any(String),
    });

    repository.findById.mockResolvedValueOnce({id: 9, userId: 4});
    await expect(service.markRead(3, 9)).rejects.toBeInstanceOf(
      HttpErrors.Forbidden,
    );
  });

  it('does not update notifications that are already read', async () => {
    const {service, repository} = createSubject();
    repository.findById.mockResolvedValue({
      id: 8,
      userId: 3,
      readAt: '2026-05-12T08:00:00.000Z',
    });

    await expect(service.markRead(3, 8)).resolves.toBeUndefined();

    expect(repository.updateById).not.toHaveBeenCalled();
  });

  it('marks all unread notifications read for the user', async () => {
    const {service, repository} = createSubject();
    repository.updateAll.mockResolvedValue({count: 2});

    await expect(service.markAllRead(3)).resolves.toBeUndefined();
    expect(repository.updateAll).toHaveBeenCalledWith(
      {readAt: expect.any(String)},
      {userId: 3, readAt: null},
    );
  });
});
