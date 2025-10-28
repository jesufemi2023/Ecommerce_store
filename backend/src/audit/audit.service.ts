// backend/src/audit/audit.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { AuditAction } from './enums/audit-action.enum';

interface AuditPayload {
  action: AuditAction | string;
  userId?: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
  timestamp?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@InjectQueue('audit') private readonly auditQueue: Queue) {}

  // enqueue a log; non-blocking for the caller
  async enqueueLog(payload: AuditPayload): Promise<void> {
    // sanitize metadata - redact possible sensitive keys
    if (payload.metadata) {
      const m = { ...payload.metadata };
      if (m.password) m.password = '***';
      if (m.token) m.token = '***';
      payload.metadata = m;
    }
    try {
      // job name 'log' and job data is payload
      await this.auditQueue.add(
        'log',
        { ...payload, timestamp: new Date().toISOString() },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
      this.logger.debug(
        `Enqueued audit event: ${payload.action} user=${payload.userId || 'N/A'}`,
      );
    } catch (err) {
      // do not throw — audit should never break request flow
      this.logger.error('Failed to enqueue audit log', err.stack || err);
    }
  }
}
