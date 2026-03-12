import { JSONAPIAdapter } from '@warp-drive/legacy/adapter/json-api';
import type {
  FetchRequestInit,
  JQueryRequestInit,
} from '@warp-drive/legacy/adapter/rest';
import type { HTTPMethod } from '@warp-drive/core/types/request';
import { service } from '@ember/service';
import { camelCase } from 'lodash';
import { pluralize } from 'ember-inflector';

const _pluralize = pluralize as (word: string) => string;

type SessionWithToken = {
  isAuthenticated: boolean;
  data: {
    authenticated: {
      token?: string;
    };
  };
};

export default class ApplicationAdapter extends JSONAPIAdapter {
  @service declare session: SessionWithToken;

  host = (import.meta.env.VITE_API_URL as string) ?? 'http://localhost:30022';

  pathForType(modelName: string): string {
    return _pluralize(camelCase(modelName));
  }

  ajaxOptions(
    url: string,
    type: HTTPMethod,
    options?: unknown
  ): JQueryRequestInit | FetchRequestInit {
    const request = super.ajaxOptions(url, type, options);
    const mutableRequest = request as (JQueryRequestInit | FetchRequestInit) & {
      headers?: Record<string, string>;
    };

    const token = this.session.data.authenticated.token;

    if (!this.session.isAuthenticated || !token) {
      return mutableRequest;
    }

    mutableRequest.headers = {
      Authorization: `Bearer ${token}`,
    };

    return mutableRequest;
  }
}
