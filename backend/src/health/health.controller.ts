// src/health/health.controller.ts
import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { RedisHealthIndicator } from './redis.health';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly redisIndicator: RedisHealthIndicator,
  ) {}

  // readiness: checks DB + Redis
  @Get()
  @HealthCheck()
  readiness() {
    return this.health.check([
      // ping the database connection (uses default TypeORM connection)
      async () => this.db.pingCheck('database'),
      // custom redis check
      async () => this.redisIndicator.isHealthy('redis'),
    ]);
  }

  // liveness: quick endpoint to say the app process is alive
  @Get('live')
  liveness() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
