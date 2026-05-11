import type UserModel from 'client/models/user';

export type ApiRequestOptions = {
  method: string;
  body?: FormData | Blob | string | Record<string, unknown>;
  params?: Record<string, string | number | boolean | undefined>;
};

export type ApiServiceLike = {
  request<T>(path: string, options: ApiRequestOptions): Promise<T>;
};

export type AuthenticatedSessionLike = {
  data: {
    authenticated: {
      token?: string;
      expiresAt?: string;
    };
  };
  invalidate(): Promise<void>;
};

export type SessionAccountServiceLike = {
  id?: number;
  user?: UserModel | null;
  clear?(): void;
};

export type FlashMessagesServiceLike = {
  success?(message: string, options?: FlashMessageOptions): void;
  info?(message: string, options?: FlashMessageOptions): void;
  danger(message: string, options?: FlashMessageOptions): void;
};

export type FlashMessageOptions = {
  title?: string;
  sticky?: boolean;
  route?: string;
  models?: unknown[];
  actionText?: string;
};

export type RouterServiceLike = {
  transitionTo(route: string): void;
};
