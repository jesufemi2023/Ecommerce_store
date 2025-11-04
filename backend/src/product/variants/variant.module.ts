import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VariantController } from './variant.controller';
import { VariantService } from './variant.service';
import { ProductVariant } from '../entities/product-variant.entity';
import { Product } from '../entities/product.entity';
import { RedisCacheService } from 'src/common/cache/redis-cache.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProductVariant, Product])],
  controllers: [VariantController],
  providers: [VariantService, RedisCacheService],
  exports: [VariantService],
})
export class VariantModule {}
