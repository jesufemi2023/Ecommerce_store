// src/common/throttler/redis-throttler.storage.ts
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import Redis from 'ioredis';

/**
 * Local record interface (we don't import ThrottlerStorageRecord to avoid version mismatches)
 */
export interface LocalThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number; // milliseconds remaining
  isBlocked: boolean;
  timeToBlockExpire: number; // milliseconds remaining for the block
  lastHitAt?: number;
}

/**
 * Redis-backed throttler storage compatible across Throttler versions.
 */
@Injectable()
export class RedisThrottlerStorage
  implements ThrottlerStorage, OnModuleDestroy
{
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly redis: Redis;

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: Number(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
    });

    this.redis.on('error', (err) => {
      this.logger.error(`Redis error: ${err?.message ?? err}`);
    });
  }

  /**
   * Increment and return a record describing current state for the key.
   *
   * @param key hashed key (usually includes IP/route etc.)
   * @param ttl window for counter (seconds)
   * @param limit max allowed hits in the window
   * @param blockDuration duration to block after exceeding limit (seconds)
   * @param throttlerName name of this throttler (from config)
   */
  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<LocalThrottlerStorageRecord> {
    const now = Date.now();
    const redisKey = `throttle:${throttlerName}:${key}`;
    const blockKey = `throttle:block:${throttlerName}:${key}`;

    // If currently blocked, return blocked record (use pttl for ms)
    const isBlocked = await this.redis.exists(blockKey);
    if (isBlocked) {
      const blockPttl = await this.redis.pttl(blockKey); // ms
      return {
        totalHits: limit,
        timeToExpire: 0,
        isBlocked: true,
        timeToBlockExpire: blockPttl > 0 ? blockPttl : 0,
        lastHitAt: now,
      };
    }

    // Increment counter
    const totalHits = await this.redis.incr(redisKey);

    // Set TTL on first hit (pexpire expects ms)
    if (totalHits === 1) {
      await this.redis.pexpire(redisKey, ttl * 1000);
    }

    // If exceeded limit, set a temporary block key
    if (totalHits > limit) {
      // set block key with PX = blockDuration*1000
      await this.redis.set(blockKey, '1', 'PX', blockDuration * 1000);
      const blockPttl = await this.redis.pttl(blockKey);
      const timeToExpire = await this.redis.pttl(redisKey);
      return {
        totalHits,
        timeToExpire: timeToExpire > 0 ? timeToExpire : 0,
        isBlocked: true,
        timeToBlockExpire: blockPttl > 0 ? blockPttl : blockDuration * 1000,
        lastHitAt: now,
      };
    }

    // Normal (not blocked) response
    const pttl = await this.redis.pttl(redisKey);
    return {
      totalHits,
      timeToExpire: pttl > 0 ? pttl : ttl * 1000,
      isBlocked: false,
      timeToBlockExpire: 0,
      lastHitAt: now,
    };
  }

  /**
   * Return basic numeric record for a key (keeps compatibility with older API expectations).
   * The throttler may call this for debugging/inspection.
   */
  async getRecord(key: string): Promise<number[]> {
    const val = await this.redis.get(key);
    return val ? [Number(val)] : [0];
  }

  async onModuleDestroy() {
    try {
      await this.redis.quit();
    } catch (e) {
      // ignore
    }
  }
}
