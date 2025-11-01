// src/addresses/entities/address.entity.ts

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('addresses')
export class Address {
  /** Unique identifier for each address */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Label to identify address type (e.g., Home, Office, etc.) */
  @Column({ nullable: true })
  label: string;

  /** Street and house number information */
  @Column()
  street_address: string;

  /** City or town name */
  @Column()
  city: string;

  /** State or region name */
  @Column()
  state: string;

  /** Postal or ZIP code */
  @Column({ nullable: true })
  postal_code: string;

  /** Country name */
  @Column()
  country: string;

  /** Marks the address as the default shipping address */
  @Column({ default: false })
  is_default: boolean;

  /** Relationship: Many addresses belong to one user */
  @ManyToOne(() => User, (user) => user.addresses, { onDelete: 'CASCADE' })
  user: User;

  /** Automatically track creation and update times */
  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
