import {describe, expect, it} from 'vitest';

import {PingController} from '../../../controllers/ping.controller';

describe('PingController (unit)', () => {
  it('returns the request details with the ping payload', () => {
    const request = {
      url: '/ping',
      headers: {
        host: 'localhost:3000',
        accept: 'application/json',
      },
    };
    const controller = new PingController(request as never);

    const response = controller.ping();

    expect(response).toMatchObject({
      greeting: 'Hello from LoopBack',
      url: '/ping',
      headers: {
        host: 'localhost:3000',
        accept: 'application/json',
      },
    });
    expect(response).toHaveProperty('date');
  });
});
