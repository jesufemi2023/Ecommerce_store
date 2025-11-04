// src/products/products.service.ts

import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { Category } from './entities/category.entity';
import { Collection } from './entities/collection.entity';
import { ProductVariant } from './entities/product-variant.entity';
import { ProductImage } from './entities/product-image.entity';
import { CreateProductDto } from './dto/product.dto';
import { ImagekitUtil } from './utils/imagekit.util';
import { RedisCacheService } from 'src/common/cache/redis-cache.service';

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
    private readonly redisCacheService: RedisCacheService,
  ) {}

  // ===============================================
  // 🟩 CREATE PRODUCT (already implemented)
  // ===============================================
  async createProduct(
    dto: CreateProductDto,
    files: Express.Multer.File[],
  ): Promise<Product> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let uploadedImages: { fileId: string }[] = [];

    try {
      const category = await this.categoryRepo.findOne({
        where: { id: dto.categoryId },
      });
      if (!category) throw new NotFoundException('Category not found');

      const collections = dto.collectionIds?.length
        ? await this.collectionRepo.findByIds(dto.collectionIds)
        : [];

      const product = this.productRepo.create({
        name: dto.name,
        description: dto.description,
        category,
        collections,
        discount: dto.discount ?? 0,
      });

      const savedProduct = await queryRunner.manager.save(product);

      if (files?.length) {
        const uploadResults = await this.imagekitUtil.uploadMultipleImages(
          files,
          'products',
        );
        uploadedImages = uploadResults;

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

      await queryRunner.commitTransaction();

      const fullProduct = await this.productRepo.findOne({
        where: { id: savedProduct.id },
        relations: ['variants', 'images', 'collections', 'category'],
      });

      await this.redisCacheService.deleteCache('products:list');
      if (dto.categoryId)
        await this.redisCacheService.deleteCache(
          `products:category:${dto.categoryId}`,
        );

      await this.redisCacheService.setCache(
        `product:${savedProduct.id}`,
        fullProduct,
        300,
      );

      this.logger.log(`✅ Product created successfully: ${savedProduct.name}`);
      return fullProduct!;
    } catch (error) {
      await queryRunner.rollbackTransaction();

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

  // ===============================================
  // 🟨 GET PRODUCTS (with search, filter, pagination, caching)
  // ===============================================
  async getProducts(query: {
    page?: number;
    limit?: number;
    search?: string;
    categoryId?: string;
    collectionId?: string;
  }) {
    try {
      const { page = 1, limit = 10, search, categoryId, collectionId } = query;

      // 1️⃣ Build unique cache key based on filters
      const cacheKey = `products:list:${JSON.stringify(query)}`;

      // 2️⃣ Check cache first
      const cachedData = await this.redisCacheService.getCache<any>(cacheKey);
      if (cachedData) {
        this.logger.debug('🟢 Returning products from cache');
        return cachedData;
      }

      // 3️⃣ Build database query dynamically
      const qb = this.productRepo
        .createQueryBuilder('product')
        .leftJoinAndSelect('product.category', 'category')
        .leftJoinAndSelect('product.collections', 'collections')
        .leftJoinAndSelect('product.images', 'images')
        .leftJoinAndSelect('product.variants', 'variants')
        .where('1=1');

      if (search) {
        qb.andWhere('LOWER(product.name) LIKE LOWER(:search)', {
          search: `%${search}%`,
        });
      }

      if (categoryId) {
        qb.andWhere('category.id = :categoryId', { categoryId });
      }

      if (collectionId) {
        qb.andWhere('collections.id = :collectionId', { collectionId });
      }

      qb.skip((page - 1) * limit).take(limit);

      // 4️⃣ Fetch results
      const [products, total] = await qb.getManyAndCount();

      // 5️⃣ Prepare paginated response
      const response = {
        data: products,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          hasNextPage: page * limit < total,
          hasPrevPage: page > 1,
        },
      };

      // 6️⃣ Cache the result for faster next requests
      await this.redisCacheService.setCache(cacheKey, response, 300);

      this.logger.debug('🟡 Products fetched from DB and cached');
      return response;
    } catch (error) {
      this.logger.error('❌ Failed to fetch products', error.stack);
      throw new InternalServerErrorException('Failed to fetch products');
    }
  }

  // ===============================================
  // 🟦 GET PRODUCT BY ID (with caching and relations)
  // ===============================================
  async getProductById(productId: string): Promise<Product> {
    try {
      const cacheKey = `product:${productId}`;

      // 1️⃣ Try Redis cache first
      const cachedProduct =
        await this.redisCacheService.getCache<Product>(cacheKey);
      if (cachedProduct) {
        this.logger.debug(`🟢 Product ${productId} fetched from cache`);
        return cachedProduct;
      }

      // 2️⃣ If not in cache, fetch from DB with all relations
      const product = await this.productRepo.findOne({
        where: { id: productId },
        relations: ['category', 'collections', 'images', 'variants'],
      });

      if (!product) {
        this.logger.warn(`⚠️ Product not found: ${productId}`);
        throw new NotFoundException('Product not found');
      }

      // 3️⃣ Cache the product for future requests (5 minutes)
      await this.redisCacheService.setCache(cacheKey, product, 300);

      this.logger.debug(`🟡 Product ${productId} fetched from DB and cached`);
      return product;
    } catch (error) {
      this.logger.error(
        `❌ Failed to fetch product by ID: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to fetch product');
    }
  }

  // ===============================================
  // 🟦 UPDATE PRODUCT (with transaction + caching)
  // ===============================================
  async updateProduct(
    productId: string,
    dto: Partial<CreateProductDto>,
    files?: Express.Multer.File[],
  ): Promise<Product> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let uploadedImages: { fileId: string }[] = [];

    try {
      // 1️⃣ Fetch existing product
      const existingProduct = await this.productRepo.findOne({
        where: { id: productId },
        relations: ['images', 'variants', 'collections', 'category'],
      });
      if (!existingProduct) throw new NotFoundException('Product not found');

      // 2️⃣ Update base fields if provided
      if (dto.name) existingProduct.name = dto.name;
      if (dto.description) existingProduct.description = dto.description;
      if (dto.discount !== undefined) existingProduct.discount = dto.discount;

      // 3️⃣ Update category if provided
      if (dto.categoryId) {
        const category = await this.categoryRepo.findOne({
          where: { id: dto.categoryId },
        });
        if (!category) throw new NotFoundException('Category not found');
        existingProduct.category = category;
      }

      // 4️⃣ Update collections if provided
      if (dto.collectionIds?.length) {
        const collections = await this.collectionRepo.findByIds(
          dto.collectionIds,
        );
        existingProduct.collections = collections;
      }

      // 5️⃣ Handle new image uploads (if any)
      if (files?.length) {
        const uploadResults = await this.imagekitUtil.uploadMultipleImages(
          files,
          'products',
        );
        uploadedImages = uploadResults;

        const newImages = uploadResults.map((res, index) =>
          queryRunner.manager.create(ProductImage, {
            imageUrl: res.url,
            publicId: res.fileId,
            isPrimary: index === 0,
            product: existingProduct,
          }),
        );

        await queryRunner.manager.save(ProductImage, newImages);
      }

      // 6️⃣ Update or add variants
      if (dto.variants?.length) {
        // remove old variants if not listed anymore
        await queryRunner.manager.delete(ProductVariant, {
          product: { id: productId },
        });

        const newVariants = dto.variants.map((variant) =>
          queryRunner.manager.create(ProductVariant, {
            ...variant,
            product: existingProduct,
            discount: variant.discount ?? existingProduct.discount ?? 0,
          }),
        );
        await queryRunner.manager.save(ProductVariant, newVariants);
      }

      // 7️⃣ Save main product updates
      const updatedProduct = await queryRunner.manager.save(existingProduct);
      await queryRunner.commitTransaction();

      // 8️⃣ Reload full product details
      const fullProduct = await this.productRepo.findOne({
        where: { id: updatedProduct.id },
        relations: ['variants', 'images', 'collections', 'category'],
      });

      // 9️⃣ Clear relevant caches
      await this.redisCacheService.deleteCache(`product:${productId}`);
      await this.redisCacheService.deleteCache('products:list');
      if (dto.categoryId)
        await this.redisCacheService.deleteCache(
          `products:category:${dto.categoryId}`,
        );

      // 🔄 Re-cache updated product
      await this.redisCacheService.setCache(
        `product:${productId}`,
        fullProduct,
        300,
      );

      this.logger.log(
        `✅ Product updated successfully: ${existingProduct.name}`,
      );
      return fullProduct!;
    } catch (error) {
      await queryRunner.rollbackTransaction();

      // Cleanup uploaded images if DB transaction fails
      if (uploadedImages.length) {
        const fileIds = uploadedImages.map((img) => img.fileId);
        await this.imagekitUtil.deleteMultipleImages(fileIds);
      }

      this.logger.error('❌ Failed to update product', error.stack);
      throw new InternalServerErrorException(
        `Failed to update product: ${error.message}`,
      );
    } finally {
      await queryRunner.release();
    }
  }

  // ===============================================
  // 🟥 DELETE PRODUCT (soft by default, hard if requested)
  // ===============================================
  /**
   * Delete a product.
   *
   * @param productId - UUID of the product to delete
   * @param permanently - if true, permanently remove product, variants and product images AND delete files from ImageKit.
   *                      if false (default) -> soft-delete the product (keeps DB records for audit/restore).
   */
  async deleteProduct(
    productId: string,
    permanently = false,
  ): Promise<{ success: true; message: string }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1️⃣ Load the product with relations we will need
      const product = await queryRunner.manager.findOne(Product, {
        where: { id: productId },
        relations: ['images', 'variants', 'collections', 'category'],
      });

      if (!product) {
        this.logger.warn(
          `⚠️ Attempted to delete non-existent product: ${productId}`,
        );
        throw new NotFoundException('Product not found');
      }

      // If permanent delete is requested, prepare list of ImageKit fileIds to remove
      const imageFileIds = (product.images || [])
        .map((img) => img.publicId)
        .filter(Boolean);

      if (permanently) {
        // 2A️⃣ Permanently remove external images first (important: if this fails, we rollback)
        if (imageFileIds.length) {
          try {
            // deleteMultipleImages will log errors internally, but we want to catch failures here
            await this.imagekitUtil.deleteMultipleImages(imageFileIds);
            this.logger.log(
              `🗑️ Deleted ${imageFileIds.length} ImageKit files for product ${productId}`,
            );
          } catch (err) {
            this.logger.error(
              `❌ Failed to delete image files for product ${productId}`,
              err?.stack ?? err,
            );
            throw new InternalServerErrorException(
              'Failed to delete product images from storage',
            );
          }
        }

        // 2B️⃣ Permanently delete ProductImage rows
        if ((product.images || []).length) {
          await queryRunner.manager.delete(ProductImage, {
            product: { id: productId },
          });
        }

        // 2C️⃣ Permanently delete variants
        await queryRunner.manager.delete(ProductVariant, {
          product: { id: productId },
        });

        // 2D️⃣ Permanently delete product row
        await queryRunner.manager.delete(Product, { id: productId });

        // Commit transaction
        await queryRunner.commitTransaction();

        // 3️⃣ Invalidate caches after successful permanent deletion
        await this.redisCacheService.deleteCache(`product:${productId}`);
        await this.redisCacheService.deleteByPrefix('products:');
        this.logger.log(
          `✅ Permanently deleted product ${productId} and invalidated cache`,
        );
        return { success: true, message: 'Product permanently deleted' };
      } else {
        // 2E️⃣ Soft-delete: mark product as deleted (deleted_at is handled by TypeORM DeleteDateColumn)
        // Soft delete the product; this will NOT remove images from ImageKit
        await queryRunner.manager.softDelete(Product, { id: productId });

        // Soft-delete variants as well (if you maintain audit/history)
        await queryRunner.manager.softDelete(ProductVariant, {
          product: { id: productId },
        });

        await queryRunner.commitTransaction();

        // 3️⃣ Invalidate caches so listings don't show the soft-deleted product
        await this.redisCacheService.deleteCache(`product:${productId}`);
        await this.redisCacheService.deleteByPrefix('products:');

        this.logger.log(
          `🟠 Soft-deleted product ${productId} and invalidated cache`,
        );
        return { success: true, message: 'Product soft-deleted' };
      }
    } catch (error) {
      // Rollback DB changes on any failure
      try {
        await queryRunner.rollbackTransaction();
      } catch (rbErr) {
        this.logger.error(
          '❌ Failed to rollback transaction',
          rbErr?.stack ?? rbErr,
        );
      }

      this.logger.error(
        `❌ Failed to delete product ${productId}`,
        error.stack ?? error,
      );
      // Re-throw sensible errors for controller to surface
      if (error instanceof NotFoundException) throw error;
      if (error instanceof InternalServerErrorException) throw error;
      throw new InternalServerErrorException(
        `Failed to delete product: ${error?.message ?? String(error)}`,
      );
    } finally {
      await queryRunner.release();
    }
  }

  
}
