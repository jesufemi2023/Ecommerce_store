import {
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
} from 'typeorm';
import { Product } from './product.entity';

@Entity({ name: 'categories' })
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 200, unique: true })
  name: string;

  // One-to-Many relation to products (inverse side defined in Product entity)
  @OneToMany(() => Product, (product) => product.category)
  products: Product[];
}
