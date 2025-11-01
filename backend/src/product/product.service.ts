// src/products/products.service.ts

import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { Category } from './entities/category.entity';
import { Collection } from './entities/collection.entity';
import { ProductVariant } from './entities/product-variant.entity';
import { ProductImage } from './entities/product-image.entity';
import { CreateProductDto } from './dto/product.dto';
import { ImagekitUtil } from './utils/imagekit.util';

/**
 * ProductsService
 * ---------------
 * Handles all business logic for product management.
 */
@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,

    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,

    @InjectRepository(Collection)
    private readonly collectionRepo: Repository<Collection>,

    private readonly dataSource: DataSource,
    private readonly imagekitUtil: ImagekitUtil,
  ) {}

  /**
   * Create a new product with variants and images.
   * Includes transactional integrity and cleanup logic.
   */
  async createProduct(
    dto: CreateProductDto,
    files: Express.Multer.File[],
  ): Promise<Product> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let uploadedImages: { fileId: string }[] = [];

    try {
      // 1️⃣ Validate category existence
      const category = await this.categoryRepo.findOne({
        where: { id: dto.categoryId },
      });
      if (!category) throw new NotFoundException('Category not found');

      // 2️⃣ Fetch collections (optional)
      const collections = dto.collectionIds?.length
        ? await this.collectionRepo.findByIds(dto.collectionIds)
        : [];

      // 3️⃣ Create base Product entity
      const product = this.productRepo.create({
        name: dto.name,
        description: dto.description,
        category,
        collections,
        discount: dto.discount ?? 0,
      });
      const savedProduct = await queryRunner.manager.save(product);

      // 4️⃣ Upload and save product images
      if (files?.length) {
        const uploadResults = await this.imagekitUtil.uploadMultipleImages(
          files,
          'products',
        );
        uploadedImages = uploadResults; // track for rollback

        const productImages = uploadResults.map((res, index) =>
          queryRunner.manager.create(ProductImage, {
            imageUrl: res.url,
            publicId: res.fileId,
            isPrimary: index === 0,
            product: savedProduct,
          }),
        );

        await queryRunner.manager.save(ProductImage, productImages);
      }

      // 5️⃣ Handle product variants
      if (dto.variants?.length) {
        const variants = dto.variants.map((variant) =>
          queryRunner.manager.create(ProductVariant, {
            ...variant,
            product: savedProduct,
            discount: variant.discount ?? dto.discount ?? 0,
          }),
        );

        await queryRunner.manager.save(ProductVariant, variants);
      }

      // ✅ Commit transaction
      await queryRunner.commitTransaction();

      // 🔄 Reload full product with relations
      const fullProduct = await this.productRepo.findOne({
        where: { id: savedProduct.id },
        relations: ['variants', 'images', 'collections', 'category'],
      });

      this.logger.log(`✅ Product created successfully: ${savedProduct.name}`);
      return fullProduct!;
    } catch (error) {
      await queryRunner.rollbackTransaction();

      // Cleanup uploaded images if DB transaction fails
      if (uploadedImages.length) {
        const fileIds = uploadedImages.map((img) => img.fileId);
        await this.imagekitUtil.deleteMultipleImages(fileIds);
      }

      this.logger.error('❌ Failed to create product', error.stack);
      throw new InternalServerErrorException(
        `Failed to create product: ${error.message}`,
      );
    } finally {
      await queryRunner.release();
    }
  }
}
