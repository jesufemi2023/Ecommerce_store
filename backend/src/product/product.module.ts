import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

// ✅ Core Product Entities
import { Product } from './entities/product.entity';
import { Category } from './entities/category.entity';
import { Collection } from './entities/collection.entity';
import { ProductVariant } from './entities/product-variant.entity';
import { ProductImage } from './entities/product-image.entity';

// ✅ Core Services & Controllers
import { ProductsService } from './product.service';
import { ProductsController } from './product.controller';

// ✅ Variant Service & Controller
//import { VariantService } from './variants/variant.service';
//import { VariantController } from './variants/variant.controller';

// ✅ Shared Utilities
import { ImagekitUtil } from './utils/imagekit.util';
import { RedisCacheService } from 'src/common/cache/redis-cache.service';

// ✅ RBAC & Auth (for secure access)
import { AuthModule } from 'src/auth/auth.module';
import { UsersModule } from 'src/users/users.module';

// ✅ Category & Collection Modules (cross-module dependency handling)
import { CategoryModule } from './category/category.module';
import { CollectionModule } from './collection/collection.module';

@Module({
  imports: [
    ConfigModule,

    // 🗃️ Register all product-related entities in TypeORM
    TypeOrmModule.forFeature([
      Product,
      Category,
      Collection,
      ProductVariant,
      ProductImage,
    ]),

    // 🔐 RBAC & Auth dependencies
    forwardRef(() => AuthModule),
    forwardRef(() => UsersModule),

    // 🧩 Product Relationships
    forwardRef(() => CategoryModule),
    forwardRef(() => CollectionModule),
  ],

  controllers: [ProductsController], // ✅ added VariantController

  providers: [ProductsService, ImagekitUtil, RedisCacheService],

  exports: [ProductsService, TypeOrmModule],
})
export class ProductsModule {}
