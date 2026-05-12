import {describe, expect, it} from 'vitest';
import {
  Notification,
  NotificationWithRelations,
  User,
  Workspace,
} from '../../../models';

describe('Notification model (unit)', () => {
  it('constructs notifications with payload and relations', () => {
    const notification: NotificationWithRelations = new Notification({
      id: 4,
      userId: 7,
      workspaceId: 11,
      type: 'communication-message',
      title: 'New message',
      message: 'Ada sent a message',
      targetRoute: 'workspaces.edit.communication',
      targetUrl: null,
      payload: {channelId: 9},
      readAt: null,
      createdAt: '2026-05-12T08:00:00.000Z',
    });

    notification.user = new User({id: 7, username: 'ada'});
    notification.workspace = new Workspace({id: 11, name: 'DevTeams'});

    expect(notification.toJSON()).toMatchObject({
      id: 4,
      userId: 7,
      workspaceId: 11,
      type: 'communication-message',
      title: 'New message',
      message: 'Ada sent a message',
      targetRoute: 'workspaces.edit.communication',
      targetUrl: null,
      payload: {channelId: 9},
      readAt: null,
      createdAt: '2026-05-12T08:00:00.000Z',
    });
    expect(notification.user?.username).toBe('ada');
    expect(notification.workspace?.name).toBe('DevTeams');
  });

  it('constructs an empty notification entity', () => {
    expect(new Notification().toJSON()).toEqual({});
  });
});
