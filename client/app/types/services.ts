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
  success?(message: string, options?: { title?: string }): void;
  danger(message: string, options?: { title?: string }): void;
};

export type RouterServiceLike = {
  transitionTo(route: string): void;
};
