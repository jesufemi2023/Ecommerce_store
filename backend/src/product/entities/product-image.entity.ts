//src/product/entities/product-image.entity.ts

import {
  Entity,
  JoinColumn,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
} from 'typeorm';
import { Product } from './product.entity';

/**
 * ProductImage
 * - Purpose: Store image metadata returned from Cloudinary (url + public_id)
 * - Fields: imageUrl (secure URL), publicId (Cloudinary reference), isPrimary
 */
@Entity({ name: 'product_images' })
export class ProductImage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 1024 })
  imageUrl: string; // secure_url from Cloudinary

  @Column({ type: 'varchar', length: 512 })
  publicId: string; // Cloudinary public_id (useful for deletions)

  @Column({ type: 'boolean', default: false })
  isPrimary: boolean;

  @ManyToOne(() => Product, (product) => product.images, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'product_id' })
  product: Product;
}
