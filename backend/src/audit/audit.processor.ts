import { Processor, Process } from '@nestjs/bull';
import type { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Logger } from '@nestjs/common';
import { AuditLog } from './entities/audit-log.entity';

@Processor('audit')
export class AuditProcessor {
  private readonly logger = new Logger(AuditProcessor.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
  ) {}

  @Process('log')
  async handleLog(job: Job) {
    const data = job.data;
    try {
      const entry = this.auditRepo.create({
        action: data.action,
        userId: data.userId || null,
        ip: data.ip || null,
        userAgent: data.userAgent || null,
        metadata: data.metadata ? JSON.stringify(data.metadata) : null,
        createdAt: data.timestamp ? new Date(data.timestamp) : new Date(),
      } as any); // createdAt will be set by DB if not provided

      await this.auditRepo.save(entry);
      this.logger.debug(`Saved audit log: ${data.action} user=${data.userId || 'N/A'}`);
    } catch (err) {
      this.logger.error('Failed to persist audit log', err.stack || err);
      throw err; // letting Bull handle retries as configured in enqueue
    }
  }
}
