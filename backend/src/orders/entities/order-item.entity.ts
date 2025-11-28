//src/orders/entities/order-item.entity.ts
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

  // 📦 Product variant relation (kept nullable in case deleted from system later)
  @ManyToOne(() => ProductVariant, { eager: true, nullable: true })
  @JoinColumn({ name: 'product_variant_id' })
  productVariant?: ProductVariant;

  // 🧾 Snapshot Fields (Immutable — taken at order time)
  @Column()
  productName: string;

  @Column()
  variantName: string;

  @Column({ nullable: true })
  sku?: string;

  @Column({ nullable: true })
  productImage?: string;

  @Column({ nullable: true })
  categoryName?: string;

  @Column({ nullable: true })
  brandName?: string;

  // 💵 Pricing snapshot
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  unitPrice: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  discountPerItem: number;

  @Column({ type: 'int' })
  quantity: number;

  // ⚖ Snapshot weight (can be used for shipping)
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 1.0 })
  weight: number;

  // 🧮 Final item cost = (unitPrice - discountPerItem) * quantity
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  totalPrice: number;
}
