import {BindingScope, injectable} from '@loopback/core';
import Redis, {RedisOptions} from 'ioredis';

@injectable({scope: BindingScope.SINGLETON})
export class RedisService {
  private readonly connectionOptions: RedisOptions;
  private readonly client: Redis;

  constructor() {
    this.connectionOptions = {
      host: process.env.REDIS_HOST ?? '127.0.0.1',
      port: Number(process.env.REDIS_PORT ?? 6379),
      maxRetriesPerRequest: null,
    };
    this.client = new Redis(this.connectionOptions);
  }

  public getClient(): Redis {
    return this.client;
  }

  public getConnectionOptions(): RedisOptions {
    return {
      ...this.connectionOptions,
    };
  }

  public async close(): Promise<void> {
    if (this.client.status === 'end') {
      return;
    }

    await this.client.quit();
  }
}
