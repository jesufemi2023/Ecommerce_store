// src/orders/orders.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { User } from 'src/users/entities/user.entity';
import { Address } from 'src/addresses/entities/address.entity';
import { ProductVariant } from 'src/product/entities/product-variant.entity';
import { RedisCacheService } from 'src/common/cache/redis-cache.service';
import { AuditService } from 'src/audit/audit.service';
import { BullModule } from '@nestjs/bull';
import { CartModule } from 'src/cart/cart.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, User, Address, ProductVariant]),
    CartModule,
    BullModule.registerQueue({
      name: 'audit',
    }),
  ],
  controllers: [OrdersController],
  providers: [OrdersService, RedisCacheService, AuditService],
  exports: [OrdersService],
})
export class OrdersModule {}
