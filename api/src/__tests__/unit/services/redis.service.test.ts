import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const redisConstructor = vi.fn(function RedisMock() {
  return {
    status: 'ready',
    quit: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('ioredis', () => ({
  default: redisConstructor,
}));

describe('RedisService (unit)', () => {
  const originalEnv = {
    REDIS_URL: process.env.REDIS_URL,
    REDIS_HOST: process.env.REDIS_HOST,
    REDIS_PORT: process.env.REDIS_PORT,
    REDIS_USERNAME: process.env.REDIS_USERNAME,
    REDIS_PASSWORD: process.env.REDIS_PASSWORD,
  };

  beforeEach(() => {
    vi.resetModules();
    redisConstructor.mockReset();
    redisConstructor.mockImplementation(function RedisMock() {
      return {
        status: 'ready',
        quit: vi.fn().mockResolvedValue(undefined),
      };
    });

    delete process.env.REDIS_URL;
    delete process.env.REDIS_HOST;
    delete process.env.REDIS_PORT;
    delete process.env.REDIS_USERNAME;
    delete process.env.REDIS_PASSWORD;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
        continue;
      }

      process.env[key] = value;
    }
  });

  it('uses REDIS_URL when it is configured', async () => {
    process.env.REDIS_URL =
      'redis://default:secret@redis.railway.internal:6379';

    const {RedisService} = await import('../../../services/redis.service');

    new RedisService();

    expect(redisConstructor).toHaveBeenCalledWith(
      'redis://default:secret@redis.railway.internal:6379',
      expect.objectContaining({
        host: '127.0.0.1',
        port: 6379,
        maxRetriesPerRequest: null,
      }),
    );
  });

  it('uses host, port, username, and password when REDIS_URL is absent', async () => {
    process.env.REDIS_HOST = 'redis.railway.internal';
    process.env.REDIS_PORT = '6380';
    process.env.REDIS_USERNAME = 'default';
    process.env.REDIS_PASSWORD = 'secret';

    const {RedisService} = await import('../../../services/redis.service');

    const service = new RedisService();

    expect(redisConstructor).toHaveBeenCalledWith({
      host: 'redis.railway.internal',
      port: 6380,
      username: 'default',
      password: 'secret',
      maxRetriesPerRequest: null,
    });
    expect(service.getConnectionOptions()).toEqual({
      host: 'redis.railway.internal',
      port: 6380,
      username: 'default',
      password: 'secret',
      maxRetriesPerRequest: null,
    });
  });
});
