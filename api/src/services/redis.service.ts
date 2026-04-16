import {BindingScope, injectable} from '@loopback/core';
import Redis, {RedisOptions} from 'ioredis';

@injectable({scope: BindingScope.SINGLETON})
export class RedisService {
  private readonly connectionOptions: RedisOptions;
  private client?: Redis;

  constructor() {
    this.connectionOptions = buildRedisConnectionOptions();
  }

  public getClient(): Redis {
    if (!this.client) {
      this.client = process.env.REDIS_URL
        ? new Redis(process.env.REDIS_URL, this.connectionOptions)
        : new Redis(this.connectionOptions);
    }

    return this.client;
  }

  public getConnectionOptions(): RedisOptions {
    return {
      ...this.connectionOptions,
    };
  }

  public async close(): Promise<void> {
    if (!this.client || this.client.status === 'end') {
      return;
    }

    await this.client.quit();
  }
}

function buildRedisConnectionOptions(): RedisOptions {
  return {
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: Number(process.env.REDIS_PORT ?? 6379),
    username: process.env.REDIS_USERNAME?.trim() || undefined,
    password: process.env.REDIS_PASSWORD?.trim() || undefined,
    maxRetriesPerRequest: null,
  };
}
