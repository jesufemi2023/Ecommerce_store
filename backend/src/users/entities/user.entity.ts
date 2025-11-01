// src/users/entities/user.entity.ts

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  DeleteDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { AuditLog } from '../../audit/entities/audit-log.entity';
import { Address } from '../../addresses/entities/address.entity';

export enum AuthProvider {
  LOCAL = 'LOCAL',
  GOOGLE = 'GOOGLE',
}

export enum UserRole {
  CUSTOMER = 'CUSTOMER',
  ADMIN = 'ADMIN',
}

@Entity('users')
export class User {
  /** Unique user identifier (UUID) */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Email address (unique for login & communication) */
  @Column({ unique: true })
  email: string;

  /** Hashed password (nullable for social login users) */
  @Column({ nullable: true })
  password_hash: string;

  /** User's full name */
  @Column({ nullable: true })
  full_name: string;

  /** Optional phone number for profile/contact/OTP */
  @Column({ nullable: true })
  phone: string;

  /** Optional user profile image */
  @Column({ nullable: true })
  avatar_url: string;

  /** Authentication provider (LOCAL or GOOGLE) */
  @Column({ type: 'enum', enum: AuthProvider, default: AuthProvider.LOCAL })
  provider: AuthProvider;

  /** Google ID if the user signed up via Google */
  @Column({ nullable: true })
  google_id: string;

  /** Indicates whether user’s email is verified */
  @Column({ default: false })
  is_email_verified: boolean;

  /** Role: customer or admin */
  @Column({ type: 'enum', enum: UserRole, default: UserRole.CUSTOMER })
  role: UserRole;

  /** True if user account is deactivated */
  @Column({ default: false })
  disabled: boolean;

  /** Timestamps */
  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @Column({ nullable: true })
  pending_email?: string;


  /** Relation: A user can have multiple addresses */
  @OneToMany(() => Address, (address) => address.user)
  addresses: Address[];

  /** Relation: A user can have multiple orders 
  @OneToMany(() => Order, (order) => order.user)
  orders: Order[]; */

  /** Relation: A user can have multiple audit logs */
  @OneToMany(() => AuditLog, (log) => log.user)
  auditLogs: AuditLog[];

  @DeleteDateColumn({ nullable: true })
  deleted_at?: Date;
}
