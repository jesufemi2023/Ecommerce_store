// backend/src/app.module.ts

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AddressModule } from './addresses/addresses.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { MailerModule } from './mailer/mailer.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { BullModule } from '@nestjs/bull';
import { AuditModule } from './audit/audit.module';

import { HealthModule } from './health/health.module';
import { RedisThrottlerStorage } from './common/throttler/redis-throttler.storage';


import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

import { ProductsModule } from './product/product.module';
import { CartModule } from './cart/cart.module';
import { OrdersModule } from './orders/orders.module';

import { PaymentModule } from './payment/payment.module';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${process.env.NODE_ENV || 'development'}`, '.env'],
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      autoLoadEntities: true, // automatically load entities from modules
      synchronize: false, //process.env.NODE_ENV !== 'production',
    }),

    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        throttlers: [
          {
            ttl: 60, // seconds
            limit: 100, // requests per minute
          },
        ],
        storage: new RedisThrottlerStorage(),
      }),
    }),

    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT),
        password: process.env.REDIS_PASSWORD || undefined,
      },
    }),

    AuditModule,
    UsersModule, // ✅ Import the modules
    AuthModule,
    MailerModule,
    HealthModule, // ← add HealthModule here
    AddressModule, // ← add AddressModule here
    ProductsModule, CartModule, OrdersModule, // ← add ProductsModule here
    PaymentModule, // ← add PaymentModule here
  ],

   // ensure Reflector is available

  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard, // 👈 Register Throttler globally
    },

    JwtAuthGuard,
    RolesGuard,
  ],
  // ❌ REMOVE these, they are already part of their modules
  // controllers: [AuthController, UsersController],
  // providers: [AuthService, UsersService],
})
export class AppModule {}
