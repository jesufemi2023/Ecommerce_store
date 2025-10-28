// src/audit/entities/audit-log.entity.ts

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // optional relation to User
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  @ManyToOne(() => User, (user) => (user as any).auditLogs, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  user?: User;

  @Column({ nullable: true })
  userId?: string;

  // typed string describing the action
  @Index()
  @Column({ type: 'varchar', length: 100 })
  action: string; // e.g., LOGIN_SUCCESS, LOGIN_FAILED

  // IP and UA for forensics
  @Column({ type: 'varchar', length: 100, nullable: true })
  ip?: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  userAgent?: string;

  // metadata should be a JSON string (avoid storing secrets)
  @Column({ type: 'text', nullable: true })
  metadata?: string;

  @Index()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
