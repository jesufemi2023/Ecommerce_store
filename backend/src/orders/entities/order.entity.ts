// order.entity.ts

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OrderItem } from './order-item.entity';
import { User } from 'src/users/entities/user.entity';
import { Address } from 'src/addresses/entities/address.entity';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 👤 The user who placed the order (nullable if guest checkout allowed)
  @ManyToOne(() => User, (user) => user.orders, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  // 📦 One order has many order items
  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true })
  items: OrderItem[];

  // 🏠 Shipping address (snapshot at time of order)
  @ManyToOne(() => Address, { eager: true, nullable: true })
  @JoinColumn({ name: 'shipping_address_id' })
  shippingAddress?: Address;

  // 💰 Subtotal before discounts and fees
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  subtotal: number;

  // 🚚 Shipping fee snapshot
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  shippingFee: number;

  // 🎟️ Discount applied at order level (promo code, etc.)
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  discount: number;

  // 💳 Final total amount (subtotal + shipping - discount)
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  total: number;

  // 📦 Order status
  @Column({
    type: 'enum',
    enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'pending',
  })
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

  // 💵 Payment status
  @Column({
    type: 'enum',
    enum: ['unpaid', 'paid', 'refunded'],
    default: 'unpaid',
  })
  paymentStatus: 'unpaid' | 'paid' | 'refunded';

  // 🧾 Payment reference or transaction ID (from Paystack/Flutterwave/etc.)
  @Column({ nullable: true })
  paymentReference?: string;

  // 📅 Audit timestamps
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
