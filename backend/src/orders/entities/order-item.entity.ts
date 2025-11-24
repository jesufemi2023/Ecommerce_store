// order-item.entity.ts

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Order } from './order.entity';
import { ProductVariant } from 'src/product/entities/product-variant.entity';

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 🛍 Linked to order
  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  // 📦 Product variant snapshot (nullable to preserve history if product deleted)
  @ManyToOne(() => ProductVariant, { eager: true, nullable: true })
  @JoinColumn({ name: 'product_variant_id' })
  productVariant?: ProductVariant;

  // 🧾 Snapshot fields (so order remains valid even if product changes)
  @Column()
  productName: string;

  @Column()
  variantName: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  unitPrice: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  discountPerItem: number;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 25.0 })
  weight: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  totalPrice: number; // (unitPrice - discountPerItem) * quantity
}
