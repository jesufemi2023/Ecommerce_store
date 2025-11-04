// src/product/category/category.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from '../entities/category.entity';
import { CategoryService } from './category.service';
import { CategoryController } from './category.controller';
import { ProductsModule } from '../product.module'; // optional (if circular, remove)

@Module({
  imports: [TypeOrmModule.forFeature([Category])],
  providers: [CategoryService],
  controllers: [CategoryController],
  exports: [CategoryService], // so products or others can use it
})
export class CategoryModule {}
