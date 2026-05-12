import Route from '@ember/routing/route';
import { service } from '@ember/service';
import type ApiService from 'client/services/api';

export type NotificationRouteModel = {
  notifications: NotificationItem[];
};

export type NotificationItem = {
  id: number;
  userId: number;
  workspaceId?: number | null;
  type: string;
  title: string;
  message: string;
  targetRoute?: string | null;
  targetUrl?: string | null;
  payload: Record<string, unknown>;
  readAt?: string | null;
  createdAt?: string;
};

type JsonApiResource = {
  id: string;
  attributes?: Record<string, unknown>;
};

type JsonApiDocument = {
  data?: JsonApiResource | JsonApiResource[];
};

export default class NotificationsRoute extends Route<NotificationRouteModel> {
  @service declare api: ApiService;

  async model(): Promise<NotificationRouteModel> {
    const payload = await this.api.request('/notifications', {
      params: {
        filter: JSON.stringify({
          limit: 80,
          order: ['createdAt DESC'],
        }),
      },
    });

    return {
      notifications: parseNotifications(payload),
    };
  }
}

function parseNotifications(payload: unknown): NotificationItem[] {
  if (Array.isArray(payload)) {
    return payload.map((item) => normalizeNotification(item));
  }

  if (isJsonApiDocument(payload)) {
    const data = Array.isArray(payload.data)
      ? payload.data
      : payload.data
        ? [payload.data]
        : [];

    return data.map((resource) =>
      normalizeNotification({
        id: resource.id,
        ...(resource.attributes ?? {}),
      })
    );
  }

  return [];
}

function normalizeNotification(payload: unknown): NotificationItem {
  const item = payload as Partial<NotificationItem>;

  return {
    id: Number(item.id),
    userId: Number(item.userId),
    workspaceId: item.workspaceId == null ? null : Number(item.workspaceId),
    type: String(item.type ?? 'notification'),
    title: String(item.title ?? 'Notification'),
    message: String(item.message ?? ''),
    targetRoute: item.targetRoute ?? null,
    targetUrl: item.targetUrl ?? null,
    payload:
      item.payload && typeof item.payload === 'object' ? item.payload : {},
    readAt: item.readAt ?? null,
    createdAt: item.createdAt,
  };
}

function isJsonApiDocument(payload: unknown): payload is JsonApiDocument {
  return Boolean(payload && typeof payload === 'object' && 'data' in payload);
}
