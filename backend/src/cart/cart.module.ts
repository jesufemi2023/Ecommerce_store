import { Module } from '@nestjs/common';
import { CartService } from './cart.service';
import { CartController } from './cart.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cart } from './entities/cart.entity';
import { CartItem } from './entities/cart-item.entity';
import { ProductVariant } from 'src/product/entities/product-variant.entity';
import { RedisCacheService } from 'src/common/cache/redis-cache.service';
import { AuditModule } from 'src/audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Cart, CartItem, ProductVariant]),
    AuditModule,
  ],
  providers: [CartService, RedisCacheService],
  controllers: [CartController],
  exports: [
    CartService,
    RedisCacheService,
    TypeOrmModule, // ✅ Export repositories so other modules (OrdersModule) can inject them
  ],
})
export class CartModule {}
