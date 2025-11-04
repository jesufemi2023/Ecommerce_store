// src/common/cache/redis-cache.service.ts

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * RedisCacheService
 * -----------------
 * Centralized caching utility using Redis.
 * Adds support for selective invalidation (by prefix)
 * and robust error handling for production environments.
 */
@Injectable()
export class RedisCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name);
  private redisClient: Redis;

  constructor(private readonly configService: ConfigService) {}

  /**
   * 🔌 Initialize Redis connection when app starts
   */
  async onModuleInit() {
    const redisHost = this.configService.get<string>('REDIS_HOST', '127.0.0.1');
    const redisPort = this.configService.get<number>('REDIS_PORT', 6379);
    const redisPassword = this.configService.get<string>('REDIS_PASSWORD', '');
    const redisDb = this.configService.get<number>('REDIS_DB', 0);

    this.redisClient = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword || undefined,
      db: redisDb,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });

    this.redisClient.on('connect', () =>
      this.logger.log(`✅ Redis connected at ${redisHost}:${redisPort}`),
    );
    this.redisClient.on('error', (err) =>
      this.logger.error('❌ Redis connection error', err),
    );
  }

  /**
   * 🧹 Gracefully close Redis connection on app shutdown
   */
  async onModuleDestroy() {
    if (this.redisClient) {
      await this.redisClient.quit();
      this.logger.log('🧹 Redis connection closed');
    }
  }

  /**
   * 🟢 Set cache with expiry
   * @param key Unique cache key
   * @param value Any serializable value
   * @param ttl Time-to-live in seconds (default 5 minutes)
   */
  async setCache(key: string, value: any, ttl = 300): Promise<void> {
    try {
      const jsonData = JSON.stringify(value);
      await this.redisClient.setex(key, ttl, jsonData);
      this.logger.debug(`🟢 Cache SET for key: ${key}`);
    } catch (error) {
      this.logger.error(`❌ Failed to set cache for key ${key}`, error.stack);
    }
  }

  /**
   * 🟡 Retrieve cache data
   * @param key Cache key
   * @returns Cached value or null
   */
  async getCache<T>(key: string): Promise<T | null> {
    try {
      const cachedData = await this.redisClient.get(key);
      if (!cachedData) return null;
      this.logger.debug(`🟡 Cache HIT for key: ${key}`);
      return JSON.parse(cachedData) as T;
    } catch (error) {
      this.logger.error(`❌ Failed to get cache for key ${key}`, error.stack);
      return null;
    }
  }

  /**
   * 🔴 Delete cache by specific key
   */
  async deleteCache(key: string): Promise<void> {
    try {
      await this.redisClient.del(key);
      this.logger.debug(`🔴 Cache DELETED for key: ${key}`);
    } catch (error) {
      this.logger.error(`❌ Failed to delete cache key ${key}`, error.stack);
    }
  }

  /**
   * 🚨 Delete multiple cache entries by prefix (e.g. "products:")
   * This avoids clearing the entire DB — it selectively invalidates related keys.
   */
  async deleteByPrefix(prefix: string): Promise<void> {
    try {
      const stream = this.redisClient.scanStream({
        match: `${prefix}*`,
        count: 100, // batch size for scanning
      });

      const pipeline = this.redisClient.pipeline();
      let keysFound = 0;

      stream.on('data', (keys: string[]) => {
        if (keys.length) {
          keys.forEach((key) => pipeline.del(key));
          keysFound += keys.length;
        }
      });

      await new Promise<void>((resolve, reject) => {
        stream.on('end', resolve);
        stream.on('error', reject);
      });

      if (keysFound > 0) {
        await pipeline.exec();
        this.logger.debug(`🧹 Deleted ${keysFound} cache entries with prefix: ${prefix}`);
      } else {
        this.logger.debug(`ℹ️ No cache keys found for prefix: ${prefix}`);
      }
    } catch (error) {
      this.logger.error(`❌ Failed to delete cache by prefix ${prefix}`, error.stack);
    }
  }

  /**
   * ⚠️ Clear all cache entries (use carefully in production)
   */
  async clearAll(): Promise<void> {
    try {
      await this.redisClient.flushdb();
      this.logger.warn('🚨 All Redis cache cleared!');
    } catch (error) {
      this.logger.error('❌ Failed to clear Redis cache', error.stack);
    }
  }
}
