// src/health/redis.health.ts
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import Redis from 'ioredis';

@Injectable()
export class RedisHealthIndicator
  extends HealthIndicator
  implements OnModuleDestroy
{
  private client: Redis;

  constructor() {
    super();
    this.client = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: Number(process.env.REDIS_PORT || 6379),
      password: process.env.REDIS_PASSWORD || undefined,
      // lazyConnect avoids immediate connect on construction in some environments
      lazyConnect: true,
    });
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      // connect if not already ready
      if (this.client.status !== 'ready') {
        await this.client.connect();
      }

      const pong = await this.client.ping(); // returns 'PONG' when healthy
      const isHealthy = pong === 'PONG';
      const result = this.getStatus(key, isHealthy, { ping: pong });

      if (!isHealthy) {
        throw new Error('Redis did not respond with PONG');
      }

      return result;
    } catch (err: any) {
      const result = this.getStatus(key, false, { error: err.message });
      // Throw HealthCheckError so Terminus returns a 503 and includes details
      throw new HealthCheckError('Redis health check failed', result);
    }
  }

  async onModuleDestroy() {
    try {
      await this.client.quit();
    } catch {
      // ignore
    }
  }
}
