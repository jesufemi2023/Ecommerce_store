// src/product/entities/product-variant.entity.ts
// Entity representing a product variant with SKU, size, color, stock, price, and optional discount.
import {
  Entity,
  PrimaryGeneratedColumn,
  Index,
  Column,
  JoinColumn,
  ManyToOne
} from 'typeorm';
import { Product } from './product.entity';

/**
 * ProductVariant
 * - Purpose: Variant-level data (sku, size, color, stock, price)
 * - Note: Variant can also have its own discount fields (optional)
 */
@Entity({ name: 'product_variants' })
export class ProductVariant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 200, unique: true })
  sku: string;

  @Column({ type: 'varchar', length: 100 })
  size: string;

  @Column({ type: 'varchar', length: 100 })
  color: string;

  @Column({ type: 'int', default: 0 })
  stock: number;

  // price is stored on the variant level (allows variant-specific pricing)
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  price: string;

  // optional variant-level discount (overrides product-level discount if active)

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  weight?: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  dimensions?: string;

  @ManyToOne(() => Product, (product) => product.variants, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ type: 'int', default: 0 })
  discount: number; // % discount per variant
}
