import {describe, expect, it} from 'vitest';
import type {InvocationContext} from '@loopback/core';

import {Workspace} from '../../../models';
import {JsonApiDeserializerInterceptor} from '../../../interceptors/json-api-deserializer.interceptor';

const buildInvocationContext = (
  args: unknown[],
  entityClass?: typeof Workspace,
): InvocationContext =>
  ({
    args,
    target: {
      repository: entityClass ? {entityClass} : undefined,
    },
  }) as InvocationContext;

describe('JsonApiDeserializerInterceptor (unit)', () => {
  it('passes through non JSON:API requests', async () => {
    const request = {
      headers: {'content-type': 'application/json'},
      body: {
        data: {
          attributes: {name: 'Demo Workspace'},
        },
      },
    };
    const interceptor = new JsonApiDeserializerInterceptor(request as never);
    const invoke = await interceptor.value();
    const next = async () => 'next-result';

    await expect(
      invoke(buildInvocationContext([{data: request.body}], Workspace), next),
    ).resolves.toBe('next-result');
    expect(request.body).toEqual({
      data: {
        attributes: {name: 'Demo Workspace'},
      },
    });
  });

  it('deserializes JSON:API attributes and belongsTo relationships', async () => {
    const request = {
      headers: {'content-type': 'application/vnd.api+json'},
      body: {
        data: {
          attributes: {
            name: 'Demo Workspace',
            avatarUrl: 'https://example.com/workspace.png',
          },
          relationships: {
            owner: {
              data: {id: 7},
            },
          },
        },
      },
    };
    const args = [{data: request.body}];
    const interceptor = new JsonApiDeserializerInterceptor(request as never);
    const invoke = await interceptor.value();
    const next = async () => request.body;

    await expect(
      invoke(buildInvocationContext(args, Workspace), next),
    ).resolves.toEqual({
      name: 'Demo Workspace',
      avatarUrl: 'https://example.com/workspace.png',
      ownerId: 7,
    });
    expect(request.body).toEqual({
      name: 'Demo Workspace',
      avatarUrl: 'https://example.com/workspace.png',
      ownerId: 7,
    });
    expect(args[0]).toEqual({
      name: 'Demo Workspace',
      avatarUrl: 'https://example.com/workspace.png',
      ownerId: 7,
    });
  });

  it('deserializes arrays of JSON:API resources', async () => {
    const request = {
      headers: {'content-type': 'application/vnd.api+json; charset=utf-8'},
      body: {
        data: [
          {
            attributes: {name: 'Workspace One'},
            relationships: {
              owner: {
                data: {id: 1},
              },
            },
          },
          {
            attributes: {name: 'Workspace Two'},
            relationships: {
              owner: {
                data: {id: 2},
              },
            },
          },
        ],
      },
    };
    const interceptor = new JsonApiDeserializerInterceptor(request as never);
    const invoke = await interceptor.value();

    await expect(
      invoke(buildInvocationContext([{}], Workspace), async () => {
        return request.body;
      }),
    ).resolves.toEqual([
      {name: 'Workspace One', ownerId: 1},
      {name: 'Workspace Two', ownerId: 2},
    ]);
  });

  it('maps null belongsTo relationship data to null foreign keys', async () => {
    const request = {
      headers: {'content-type': 'application/vnd.api+json'},
      body: {
        data: {
          attributes: {name: 'Workspace Without Owner'},
          relationships: {
            owner: {
              data: null,
            },
          },
        },
      },
    };
    const interceptor = new JsonApiDeserializerInterceptor(request as never);
    const invoke = await interceptor.value();

    await expect(
      invoke(buildInvocationContext([{}], Workspace), async () => {
        return request.body;
      }),
    ).resolves.toEqual({
      name: 'Workspace Without Owner',
      ownerId: null,
    });
  });

  it('ignores bodies without a JSON:API data member', async () => {
    const request = {
      headers: {'content-type': 'application/vnd.api+json'},
      body: {
        attributes: {name: 'Not Wrapped'},
      },
    };
    const interceptor = new JsonApiDeserializerInterceptor(request as never);
    const invoke = await interceptor.value();
    const next = async () => 'unchanged';

    await expect(
      invoke(buildInvocationContext([{}], Workspace), next),
    ).resolves.toBe('unchanged');
    expect(request.body).toEqual({
      attributes: {name: 'Not Wrapped'},
    });
  });
});
