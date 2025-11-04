import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Collection } from '../entities/collection.entity';
import { Product } from '../entities/product.entity';
import { CollectionsService } from './collection.service';
import { CollectionsController } from './collection.controller';
import { RedisCacheService } from 'src/common/cache/redis-cache.service';
import { ProductsModule } from '../product.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Collection, Product]),
    forwardRef(() => ProductsModule), // avoid circular if needed
  ],
  controllers: [CollectionsController],
  providers: [CollectionsService, RedisCacheService],
  exports: [CollectionsService],
})
export class CollectionModule {}
