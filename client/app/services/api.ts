import Service from '@ember/service';
import { service } from '@ember/service';
import type SessionService from 'ember-simple-auth/services/session';

interface RequestOptions {
  method?: string;
  body?: unknown;
  params?: Record<string, string>;
}

export default class ApiService extends Service {
  @service session!: SessionService;

  get baseUrl(): string {
    return import.meta.env.VITE_API_URL as string;
  }

  async request(url: string, options: RequestOptions = {}): Promise<unknown> {
    const { method = 'GET', body, params } = options;

    const fullUrl = new URL(url, this.baseUrl);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        fullUrl.searchParams.set(key, value);
      });
    }

    const headers: Record<string, string> = {};

    if (
      this.session.isAuthenticated &&
      this.session.data.authenticated?.token
    ) {
      headers['Authorization'] =
        `Bearer ${String(this.session.data.authenticated.token)}`;
    }

    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (body && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      if (body instanceof FormData || body instanceof Blob) {
        fetchOptions.body = body;
      } else {
        fetchOptions.body = JSON.stringify(body);
        headers['Content-Type'] = 'application/json';
      }
    }

    // eslint-disable-next-line warp-drive/no-external-request-patterns
    const response = await fetch(fullUrl.toString(), fetchOptions);

    if (!response.ok) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const errorData = await response.json();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
      throw new Error(errorData.error.message);
    }

    return response.json();
  }
}
