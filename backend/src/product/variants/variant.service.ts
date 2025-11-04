//src/product/variants/variant.service.ts

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ProductVariant } from '../entities/product-variant.entity';
import { Product } from '../entities/product.entity';
import { CreateVariantDto, UpdateVariantDto } from '../dto/variant.dto';
import { RedisCacheService } from 'src/common/cache/redis-cache.service';

@Injectable()
export class VariantService {
  private readonly logger = new Logger(VariantService.name);

  constructor(
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,

    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,

    private readonly redisCacheService: RedisCacheService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * 🟩 Create Variant
   */
  async createVariant(dto: CreateVariantDto): Promise<ProductVariant> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const product = await this.productRepo.findOne({
        where: { id: dto.productId },
      });
      if (!product) throw new NotFoundException('Product not found');

      const exists = await this.variantRepo.findOne({
        where: { sku: dto.sku },
      });
      if (exists)
        throw new BadRequestException('Variant with this SKU already exists');

      const variant = queryRunner.manager.create(ProductVariant, {
        ...dto,
        product,
        discount: dto.discount ?? product.discount ?? 0,
      });

      const savedVariant = await queryRunner.manager.save(
        ProductVariant,
        variant,
      );
      await queryRunner.commitTransaction();

      // Invalidate cache
      await this.redisCacheService.deleteCache(`product:${dto.productId}`);
      await this.redisCacheService.deleteByPrefix('products:');

      this.logger.log(`✅ Created variant SKU: ${savedVariant.sku}`);
      return savedVariant;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('❌ Failed to create variant', error.stack);
      throw new InternalServerErrorException('Failed to create variant');
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * 🟨 Get all variants (optionally by product)
   */
  async getVariants(productId?: string): Promise<ProductVariant[]> {
    try {
      const cacheKey = productId
        ? `variants:product:${productId}`
        : 'variants:list';
      const cached =
        await this.redisCacheService.getCache<ProductVariant[]>(cacheKey);
      if (cached) return cached;

      const variants = productId
        ? await this.variantRepo.find({ where: { product: { id: productId } } })
        : await this.variantRepo.find();

      await this.redisCacheService.setCache(cacheKey, variants, 300);
      return variants;
    } catch (error) {
      this.logger.error('❌ Failed to fetch variants', error.stack);
      throw new InternalServerErrorException('Failed to fetch variants');
    }
  }

  /**
   * 🟦 Get single variant
   */
  async getVariantById(id: string): Promise<ProductVariant> {
    const cacheKey = `variant:${id}`;
    const cached =
      await this.redisCacheService.getCache<ProductVariant>(cacheKey);
    if (cached) return cached;

    const variant = await this.variantRepo.findOne({
      where: { id },
      relations: ['product'],
    });
    if (!variant) throw new NotFoundException('Variant not found');

    await this.redisCacheService.setCache(cacheKey, variant, 300);
    return variant;
  }

  /**
   * 🟪 Update variant
   */
  async updateVariant(
    id: string,
    dto: UpdateVariantDto,
  ): Promise<ProductVariant> {
    const variant = await this.variantRepo.findOne({
      where: { id },
      relations: ['product'],
    });
    if (!variant) throw new NotFoundException('Variant not found');

    Object.assign(variant, dto);
    const updated = await this.variantRepo.save(variant);

    // Invalidate related caches
    await this.redisCacheService.deleteCache(`variant:${id}`);
    await this.redisCacheService.deleteCache(`product:${variant.product.id}`);
    await this.redisCacheService.deleteByPrefix('variants:');

    this.logger.log(`🟢 Updated variant: ${updated.sku}`);
    return updated;
  }

  /**
   * 🟥 Delete variant
   */
  async deleteVariant(id: string): Promise<{ success: true; message: string }> {
    const variant = await this.variantRepo.findOne({
      where: { id },
      relations: ['product'],
    });
    if (!variant) throw new NotFoundException('Variant not found');

    await this.variantRepo.delete(id);

    await this.redisCacheService.deleteCache(`variant:${id}`);
    await this.redisCacheService.deleteCache(`product:${variant.product.id}`);
    await this.redisCacheService.deleteByPrefix('variants:');

    this.logger.log(`🗑️ Deleted variant ${variant.sku}`);
    return { success: true, message: 'Variant deleted successfully' };
  }
}
