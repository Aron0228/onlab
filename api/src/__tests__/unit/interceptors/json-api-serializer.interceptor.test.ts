import {describe, expect, it, beforeEach} from 'vitest';
import type {InvocationContext} from '@loopback/core';

import {User, Workspace} from '../../../models';
import {JsonApiSerializerInterceptor} from '../../../interceptors/json-api-serializer.interceptor';

const createResponse = () => {
  const state = {
    header: undefined as string | undefined,
    payload: undefined as string | undefined,
  };

  const response = {
    setHeader: (_name: string, value: string) => {
      state.header = value;
    },
    end: (payload: string) => {
      state.payload = payload;
    },
  };

  return {response, state};
};

const buildInvocationContext = (
  entityClass?: typeof Workspace | typeof User,
  targetName?: string,
): InvocationContext =>
  ({
    target: {
      repository: entityClass ? {entityClass} : undefined,
    },
    targetName,
  }) as InvocationContext;

describe('JsonApiSerializerInterceptor (unit)', () => {
  beforeEach(() => {
    process.env.API_HOST = 'https://api.example.com';
  });

  it('passes through results when no entity class is available', async () => {
    const request = {
      originalUrl: '/custom',
      path: '/custom',
      params: {},
    };
    const {response, state} = createResponse();
    const interceptor = new JsonApiSerializerInterceptor(
      request as never,
      response as never,
    );
    const invoke = await interceptor.value();

    await expect(
      invoke(buildInvocationContext(), async () => ({
        ok: true,
      })),
    ).resolves.toEqual({ok: true});
    expect(state.header).toBeUndefined();
    expect(state.payload).toBeUndefined();
  });

  it('serializes null results as JSON:API null data', async () => {
    const request = {
      originalUrl: '/workspaces/11',
      path: '/workspaces/11',
      params: {id: '11'},
    };
    const {response, state} = createResponse();
    const interceptor = new JsonApiSerializerInterceptor(
      request as never,
      response as never,
    );
    const invoke = await interceptor.value();

    const result = await invoke(
      buildInvocationContext(Workspace, 'findById'),
      async () => null,
    );

    expect(result).toBe(response);
    expect(state.header).toBe('application/vnd.api+json');
    expect(JSON.parse(state.payload ?? '')).toEqual({
      links: {self: 'https://api.example.com/workspaces/11'},
      data: null,
    });
  });

  it('serializes a single entity and derives belongsTo relationships from foreign keys', async () => {
    const request = {
      originalUrl: '/workspaces/11',
      path: '/workspaces/11',
      params: {id: '11'},
    };
    const {response, state} = createResponse();
    const interceptor = new JsonApiSerializerInterceptor(
      request as never,
      response as never,
    );
    const invoke = await interceptor.value();
    const workspace = new Workspace({
      id: 11,
      name: 'Demo Workspace',
      ownerId: 7,
      avatarUrl: 'https://example.com/workspace.png',
    });

    await invoke(
      buildInvocationContext(Workspace, 'findById'),
      async () => workspace,
    );

    const payload = JSON.parse(state.payload ?? '');

    expect(state.header).toBe('application/vnd.api+json');
    expect(payload.links.self).toBe('https://api.example.com/workspaces/11');
    expect(payload.data.type).toBe('workspaces');
    expect(payload.data.id).toBe('11');
    expect(payload.data.attributes.name).toBe('Demo Workspace');
    expect(payload.data.relationships.owner.data).toEqual({
      type: 'users',
      id: '7',
    });
    expect(payload.data.relationships.owner.links.related).toBe(
      'https://api.example.com/Workspaces/11/owner',
    );
    expect(payload.data.links.self).toBe(
      'https://api.example.com/workspaces/11',
    );
  });

  it('serializes collections with collection-scoped self links', async () => {
    const request = {
      originalUrl: '/workspaces',
      path: '/workspaces',
      params: {},
    };
    const {response, state} = createResponse();
    const interceptor = new JsonApiSerializerInterceptor(
      request as never,
      response as never,
    );
    const invoke = await interceptor.value();
    const workspaces = [
      new Workspace({
        id: 11,
        name: 'Workspace One',
        ownerId: 7,
      }),
      new Workspace({
        id: 12,
        name: 'Workspace Two',
        ownerId: 7,
      }),
    ];

    await invoke(buildInvocationContext(Workspace), async () => {
      return workspaces;
    });

    const payload = JSON.parse(state.payload ?? '');

    expect(payload.links.self).toBe('https://api.example.com/workspaces');
    expect(payload.data).toHaveLength(2);
    expect(payload.data[0].links.self).toBe(
      'https://api.example.com/workspaces/11',
    );
    expect(payload.data[1].links.self).toBe(
      'https://api.example.com/workspaces/12',
    );
  });

  it('includes loaded relations in the included payload', async () => {
    const request = {
      originalUrl: '/workspaces/11',
      path: '/workspaces/11',
      params: {id: '11'},
    };
    const {response, state} = createResponse();
    const interceptor = new JsonApiSerializerInterceptor(
      request as never,
      response as never,
    );
    const invoke = await interceptor.value();
    const workspace = new Workspace({
      id: 11,
      name: 'Demo Workspace',
      ownerId: 7,
    }) as Workspace & {owner: User};
    workspace.owner = new User({
      id: 7,
      githubId: 1,
      username: 'aron0228',
      fullName: 'Reszegi Aron',
      email: 'aron@example.com',
      avatarUrl: 'https://example.com/avatar.png',
    });

    await invoke(
      buildInvocationContext(Workspace, 'findById'),
      async () => workspace,
    );

    const payload = JSON.parse(state.payload ?? '');

    expect(payload.data.relationships.owner.data).toEqual({
      type: 'users',
      id: '7',
    });
    expect(payload.included).toEqual([
      expect.objectContaining({
        type: 'users',
        id: '7',
        attributes: expect.objectContaining({
          username: 'aron0228',
          fullName: 'Reszegi Aron',
        }),
      }),
    ]);
  });
});
