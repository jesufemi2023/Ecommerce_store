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
import { CreateVariantDto, UpdateVariantDto } from './dto/variant.dto';

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
  // src/product/product.service.ts
  // src/product/product.service.ts
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

      // 2️⃣ Load collections if provided
      const collections = dto.collectionIds?.length
        ? await this.collectionRepo.findByIds(dto.collectionIds)
        : [];

      // 3️⃣ Create base product
      const product = this.productRepo.create({
        name: dto.name,
        description: dto.description,
        category,
        collections,
        discount: dto.discount ?? 0,
      });

      const savedProduct = await queryRunner.manager.save(product);
      this.logger.log(`✅ Base product created: ${savedProduct.name}`);

      // 4️⃣ Handle image uploads
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
        this.logger.log(
          `🖼️ Uploaded ${productImages.length} images for product`,
        );
      }

      // 5️⃣ Handle variants if provided
      if (dto.variants?.length) {
        const variants = dto.variants.map((v) =>
          queryRunner.manager.create(ProductVariant, {
            variantName: v.name,
            sku: v.sku ?? undefined,
            size: v.size ?? undefined,
            color: v.color ?? undefined,
            stock: v.stock ?? 0,
            price: String(v.price), // ✅ Convert number to string
            weight: v.weight,
            dimensions: v.dimensions,
            discount: v.discount ?? dto.discount ?? 0,
            product: savedProduct,
          }),
        );

        await queryRunner.manager.save(ProductVariant, variants);
        this.logger.log(`🎨 Created ${variants.length} variants for product`);
      }

      await queryRunner.commitTransaction();

      // 6️⃣ Fetch full product with relations for response
      const fullProduct = await this.productRepo.findOne({
        where: { id: savedProduct.id },
        relations: ['variants', 'images', 'collections', 'category'],
      });

      // 7️⃣ Cache invalidation
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

      this.logger.log(
        `✅ Product creation complete and cached: ${savedProduct.name}`,
      );
      return fullProduct!;
    } catch (error) {
      await queryRunner.rollbackTransaction();

      // Cleanup uploaded images if transaction fails
      if (uploadedImages.length) {
        const fileIds = uploadedImages.map((img) => img.fileId);
        await this.imagekitUtil.deleteMultipleImages(fileIds);
        this.logger.warn('🗑️ Rolled back uploaded images due to error');
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
      // 1️⃣ Fetch existing product with all relations
      const existingProduct = await this.productRepo.findOne({
        where: { id: productId },
        relations: ['variants', 'images', 'collections', 'category'],
      });
      if (!existingProduct) throw new NotFoundException('Product not found');

      this.logger.log(`🔄 Updating product: ${existingProduct.name}`);

      // 2️⃣ Update basic fields if provided
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

      // 5️⃣ Handle new image uploads
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
        this.logger.log(
          `🖼️ Uploaded ${newImages.length} new images for product`,
        );
      }

      // 6️⃣ Update variants if provided
      if (dto.variants?.length) {
        // Remove old variants
        await queryRunner.manager.delete(ProductVariant, {
          product: { id: productId },
        });

        // Create new variants
        const newVariants = dto.variants.map((v) =>
          queryRunner.manager.create(ProductVariant, {
            sku: v.sku ?? undefined,
            size: v.size ?? undefined,
            color: v.color ?? undefined,
            stock: v.stock ?? 0,
            price: String(v.price), // ✅ Convert number to string
            weight: v.weight,
            dimensions: v.dimensions,
            discount: v.discount ?? existingProduct.discount ?? 0,
            product: existingProduct,
          }),
        );

        await queryRunner.manager.save(ProductVariant, newVariants);
        this.logger.log(
          `🎨 Updated ${newVariants.length} variants for product`,
        );
      }

      // 7️⃣ Save main product
      const updatedProduct = await queryRunner.manager.save(existingProduct);
      await queryRunner.commitTransaction();

      // 8️⃣ Reload full product with relations
      const fullProduct = await this.productRepo.findOne({
        where: { id: updatedProduct.id },
        relations: ['variants', 'images', 'collections', 'category'],
      });

      // 9️⃣ Cache invalidation & refresh
      await this.redisCacheService.deleteCache(`product:${productId}`);
      await this.redisCacheService.deleteCache('products:list');
      if (dto.categoryId)
        await this.redisCacheService.deleteCache(
          `products:category:${dto.categoryId}`,
        );
      await this.redisCacheService.setCache(
        `product:${productId}`,
        fullProduct,
        300,
      );

      this.logger.log(
        `✅ Product update complete and cached: ${existingProduct.name}`,
      );
      return fullProduct!;
    } catch (error) {
      await queryRunner.rollbackTransaction();

      if (uploadedImages.length) {
        const fileIds = uploadedImages.map((img) => img.fileId);
        await this.imagekitUtil.deleteMultipleImages(fileIds);
        this.logger.warn('🗑️ Rolled back uploaded images due to error');
      }

      this.logger.error('❌ Failed to update product', error.stack);
      throw new InternalServerErrorException(
        `Failed to update product: ${error.message}`,
      );
    } finally {
      await queryRunner.release();
    }
  }

  // ============================
  // 🟥 BULK DELETE PRODUCTS
  // ============================
  async deleteProducts(
    productIds: string[],
    permanently = false,
  ): Promise<{ success: true; message: string }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (const productId of productIds) {
        await this.deleteProducts([productId], permanently);
      }

      await queryRunner.commitTransaction();
      this.logger.log(
        `🗑️ Bulk delete completed for products: ${productIds.join(', ')}`,
      );

      // Clear list cache after bulk delete
      await this.redisCacheService.deleteByPrefix('products:');

      return {
        success: true,
        message: `Deleted ${productIds.length} products`,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('❌ Failed to bulk delete products', error.stack);
      throw new InternalServerErrorException(
        error.message || 'Failed to delete products',
      );
    } finally {
      await queryRunner.release();
    }
  }
  
  
  // ---------------------- VARIANT METHODS ----------------------
  /**
   * Add a new variant to an existing product
   * @param productId - UUID of the parent product
   * @param dto - Partial<CreateVariantDto> (only price is required)
   */
  async addVariantToProduct(
    productId: string,
    variantDto: Partial<CreateVariantDto>, // all fields optional except price
  ): Promise<ProductVariant> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1️⃣ Fetch the parent product
      const product = await queryRunner.manager.findOne(Product, {
        where: { id: productId },
        relations: ['variants'],
      });

      if (!product) {
        this.logger.warn(`⚠️ Product not found: ${productId}`);
        throw new NotFoundException('Product not found');
      }

      // 2️⃣ Auto-generate SKU if not provided
      const generatedSku =
        variantDto.sku ??
        `${product.name.replace(/\s+/g, '-').toLowerCase()}-${Math.random()
          .toString(36)
          .substring(2, 8)
          .toUpperCase()}`;

      // 2️⃣ Create the new variant safely
      const variant = queryRunner.manager.create(ProductVariant, {
        product,
        discount: variantDto.discount ?? product.discount ?? 0,
        stock: variantDto.stock ?? 0,
        price: variantDto.price?.toString() ?? '0', // convert number to string
        sku: generatedSku,
        size: variantDto.size,
        color: variantDto.color,
        weight: variantDto.weight,
        dimensions: variantDto.dimensions,
      });

      // 3️⃣ Save the variant
      const savedVariant = await queryRunner.manager.save(
        ProductVariant,
        variant,
      );

      await queryRunner.commitTransaction();
      this.logger.log(
        `✅ Variant added to product ${product.name} (SKU: ${variant.sku})`,
      );

      return savedVariant;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `❌ Failed to add variant to product ${productId}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        `Failed to add variant: ${error.message}`,
      );
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Update a variant (all fields optional)
   */
  async updateProductVariant(
    productId: string,
    variantId: string,
    dto: Partial<UpdateVariantDto>,
  ): Promise<ProductVariant> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const variant = await queryRunner.manager.findOne(ProductVariant, {
        where: { id: variantId },
        relations: ['product'],
      });
      if (!variant || variant.product.id !== productId)
        throw new NotFoundException('Variant not found for this product');

      // Only update provided fields
      Object.assign(variant, dto);

      const updatedVariant = await queryRunner.manager.save(variant);
      await queryRunner.commitTransaction();

      this.logger.log(
        `✅ Variant ${variantId} updated for product ${productId}`,
      );

      // Invalidate caches
      await this.redisCacheService.deleteCache(`product:${productId}`);
      await this.redisCacheService.deleteCache('products:list');

      return updatedVariant;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `❌ Failed to update variant ${variantId}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        error.message || 'Failed to update variant',
      );
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Get all variants for a product
   */
  async getVariantsByProduct(productId: string): Promise<ProductVariant[]> {
    const variants = await this.productRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.variants', 'variants')
      .where('product.id = :productId', { productId })
      .getOne();

    if (!variants) throw new NotFoundException('Product not found');
    return variants.variants;
  }

  /**
   * Get a single variant by ID under a product
   */
  async getVariantById(
    productId: string,
    variantId: string,
  ): Promise<ProductVariant> {
    const variant = await this.productRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.variants', 'variants')
      .where('product.id = :productId', { productId })
      .andWhere('variants.id = :variantId', { variantId })
      .getOne();

    if (!variant || !variant.variants.length)
      throw new NotFoundException('Variant not found');
    return variant.variants[0];
  }

  /**
   * Delete a variant (soft delete by default)
   */
 // ============================
// 🟥 BULK DELETE VARIANTS
// ============================
async deleteProductVariants(
  productId: string,
  variantIds: string[],
  permanently = false,
): Promise<{ success: true; message: string }> {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    for (const variantId of variantIds) {
      await this.deleteProductVariants(productId, [variantId], permanently);
    }

    await queryRunner.commitTransaction();
    this.logger.log(
      `🗑️ Bulk delete completed for variants: ${variantIds.join(', ')} under product ${productId}`,
    );

    // Invalidate caches after bulk delete
    await this.redisCacheService.deleteCache(`product:${productId}`);
    await this.redisCacheService.deleteCache('products:list');

    return { success: true, message: `Deleted ${variantIds.length} variants` };
  } catch (error) {
    await queryRunner.rollbackTransaction();
    this.logger.error('❌ Failed to bulk delete variants', error.stack);
    throw new InternalServerErrorException(error.message || 'Failed to delete variants');
  } finally {
    await queryRunner.release();
  }
}
}
