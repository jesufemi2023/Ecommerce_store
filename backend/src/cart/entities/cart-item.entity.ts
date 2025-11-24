// src/cart/entities/cart-item.entity.ts

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Cart } from './cart.entity';
import { ProductVariant } from 'src/product/entities/product-variant.entity';

@Entity('cart_items')
export class CartItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * The cart that this item belongs to.
   */
  @ManyToOne(() => Cart, (cart) => cart.items, { onDelete: 'CASCADE' })
  cart: Cart;

  /**
   * The specific variant added to the cart (e.g. color/size/storage).
   */
  @ManyToOne(() => ProductVariant, { eager: true, onDelete: 'CASCADE' })
  variant: ProductVariant;

  /**
   * Cached product name (for faster reads and display).
   */
  @Column({ type: 'varchar', nullable: true })
  productName?: string;

  /**
   * Cached product image (for faster display in UI).
   */
  @Column({ type: 'varchar', nullable: true })
  productImage?: string;

  /**
   * Cached variant name or label (e.g., "256GB Black").
   */
  @Column({ type: 'varchar', nullable: true })
  variantLabel?: string;

  /**
   * Number of units of this variant in the cart.
   */
  @Column({ type: 'int', default: 1 })
  quantity: number;

  /**
   * Price per unit when added to the cart.
   * This ensures future price changes don’t affect old cart items.
   */
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  unitPrice: number;

  /**
   * Total for this cart item (quantity × price).
   */
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  totalPrice: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
