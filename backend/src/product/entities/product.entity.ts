//src/product/entities/product.entity.ts

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  ManyToMany,
  JoinTable,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import { Category } from './category.entity';
import { Collection } from './collection.entity';
import { ProductVariant } from './product-variant.entity';
import { ProductImage } from './product-image.entity';
/**
 * Product
 * - Purpose: Core product data (no base price; variants contain price)
 * - Holds descriptive fields, category, collections, images, and product-level discounts
 */
@Entity({ name: 'products' })
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 300 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  // Relation to Category (eager load for convenience)
  @ManyToOne(() => Category, (category) => category.products, {
    eager: true,
    nullable: false,
  })
  @JoinColumn({ name: 'category_id' })
  category: Category;

  // One product -> many variants. Cascade to allow create/update nested variants.
  @OneToMany(() => ProductVariant, (variant) => variant.product, {
    cascade: true,
    eager: true,
  })
  variants: ProductVariant[];

  // Images handled via ProductImage entity (one-to-many)
  @OneToMany(() => ProductImage, (img) => img.product, {
    cascade: true,
    eager: true,
  })
  images: ProductImage[];

  // Collections: many-to-many
  @ManyToMany(() => Collection, (collection) => collection.products, {
    eager: false,
  })
  @JoinTable({ name: 'products_collections' })
  collections: Collection[];

  // Optional product-level discount
  @Column({ type: 'int', default: 0 })
  discount: number; // % discount per variant

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deleted_at?: Date;
}
