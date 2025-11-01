import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { Product } from './product.entity';
/**
 * Collection
 * - Purpose: Curated grouping for marketing (e.g. Summer Sale, Bestsellers)
 * - Relationship: Many-to-Many with Products
 */
@Entity({ name: 'collections' })
export class Collection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  // Many-to-many relation with Product. Join table lives on Collection side by default.
  @ManyToMany(() => Product, (product) => product.collections)
  @JoinTable({ name: 'collections_products' })
  products: Product[];
}
