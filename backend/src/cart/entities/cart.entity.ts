// src/cart/entities/cart.entity.ts

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { CartItem } from './cart-item.entity';

export enum CartStatus {
  ACTIVE = 'ACTIVE',
  CHECKED_OUT = 'CHECKED_OUT',
  ABANDONED = 'ABANDONED',
}

@Entity('carts')
export class Cart {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * The user who owns this cart.
   * A user typically has one active cart and multiple completed/abandoned ones.
   */
  @ManyToOne(() => User, (user) => user.carts, { onDelete: 'CASCADE', eager: false })
  user: User;

  /**
   * List of items currently in this cart.
   * One cart can contain multiple cart items.
   */
  @OneToMany(() => CartItem, (item) => item.cart, { cascade: true, eager: true })
  items: CartItem[];

  /**
   * Total monetary amount of this cart (sum of all item totalPrices).
   * This value is recalculated whenever items are added or removed.
   */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0.0 })
  totalAmount: number;

  @Column({ type: 'int', default: 0 })
  totalItems: number;


  /**
   * Cart status lifecycle.
   * ACTIVE → user is adding/removing items
   * CHECKED_OUT → converted into an order
   * ABANDONED → inactive for a long time
   */
  @Column({
    type: 'enum',
    enum: CartStatus,
    default: CartStatus.ACTIVE,
  })
  status: CartStatus;

  /**
   * Optional session or device identifier for guest carts.
   * Useful for users who are not logged in.
   */
  @Column({ nullable: true })
  sessionId?: string;

  /**
   * Optional field to support multi-device sync or B2B carts.
   */
  @Column({ nullable: true })
  currency?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ default: false })
  isLocked: boolean;

}
