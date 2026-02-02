import { Client } from '@loopback/testlab';
import { describe, it, beforeAll, afterAll, expect } from 'vitest';

import { RestApi } from '../../application';
import { setupApplication } from './test-helper';
import { PingController } from '../../controllers';

describe('PingController (acceptance)', () => {
  let app: RestApi;
  let client: Client;

  beforeAll(async () => {
    ({ app, client } = await setupApplication());

    app.controller(PingController);
  });

  afterAll(async () => {
    await app.stop();
  });

  it('invokes GET /ping', async () => {
    const res = await client.get('/ping?msg=world');

    expect(res.ok).toBe(true);
    expect(res.body).toHaveProperty('greeting');
    expect(res.body.greeting).toContain('Hello');
  });
});
