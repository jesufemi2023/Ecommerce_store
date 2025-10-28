// backend/src/audit/audit.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { AuditLog } from './entities/audit-log.entity';
import { AuditService } from './audit.service';
import { AuditProcessor } from './audit.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLog]),
    BullModule.registerQueue({ name: 'audit' }),
  ],
  providers: [AuditService, AuditProcessor],
  exports: [AuditService],
})
export class AuditModule {}
