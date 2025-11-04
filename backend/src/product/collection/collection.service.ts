import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, ILike } from 'typeorm';
import { Collection } from '../entities/collection.entity';
import { Product } from '../entities/product.entity';
import { CreateCollectionDto, UpdateCollectionDto } from '../dto/collection.dto';
import { RedisCacheService } from 'src/common/cache/redis-cache.service';

@Injectable()
export class CollectionsService {
  private readonly logger = new Logger(CollectionsService.name);

  constructor(
    @InjectRepository(Collection)
    private readonly collectionRepo: Repository<Collection>,

    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,

    private readonly dataSource: DataSource,
    private readonly redisCacheService: RedisCacheService,
  ) {}

  /**
   * Create a new collection. Optionally attach productIds.
   * Uses transaction for safety and invalidates cache on success.
   */
  async createCollection(dto: CreateCollectionDto): Promise<Collection> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Validate productIds if provided
      const products =
        dto.productIds && dto.productIds.length
          ? await this.productRepo.findByIds(dto.productIds)
          : [];

      const collection = this.collectionRepo.create({
        name: dto.name,
        description: dto.description,
        products,
      });

      const saved = await queryRunner.manager.save(collection);
      await queryRunner.commitTransaction();

      // Invalidate caches (collections list + product lists)
      await this.redisCacheService.deleteCache('collections:list');
      await this.redisCacheService.deleteByPrefix('products:');

      this.logger.log(`✅ Created collection: ${saved.name}`);
      return saved;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('❌ Failed to create collection', error.stack ?? error);
      throw new InternalServerErrorException(
        `Failed to create collection: ${error?.message ?? error}`,
      );
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * List collections with optional search and pagination.
   * Results are cached by query params.
   */
  async getCollections(query: {
    page?: number;
    limit?: number;
    search?: string;
  }) {
    try {
      const { page = 1, limit = 20, search } = query;
      const cacheKey = `collections:list:${JSON.stringify(query)}`;

      const cached = await this.redisCacheService.getCache<any>(cacheKey);
      if (cached) {
        this.logger.debug('🟢 Returning collections from cache');
        return cached;
      }

      const qb = this.collectionRepo
        .createQueryBuilder('collection')
        .leftJoinAndSelect('collection.products', 'product')
        .where('1=1');

      if (search) {
        qb.andWhere('LOWER(collection.name) LIKE LOWER(:search)', {
          search: `%${search}%`,
        });
      }

      qb.skip((page - 1) * limit).take(limit).orderBy('collection.name', 'ASC');

      const [data, total] = await qb.getManyAndCount();

      const response = {
        data,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          hasNextPage: page * limit < total,
          hasPrevPage: page > 1,
        },
      };

      await this.redisCacheService.setCache(cacheKey, response, 300);
      this.logger.debug('🟡 Collections fetched from DB and cached');
      return response;
    } catch (error) {
      this.logger.error('❌ Failed to fetch collections', error.stack ?? error);
      throw new InternalServerErrorException('Failed to fetch collections');
    }
  }

  /**
   * Get a single collection by id (cached).
   */
  async getCollectionById(id: string): Promise<Collection> {
    try {
      const cacheKey = `collection:${id}`;
      const cached = await this.redisCacheService.getCache<Collection>(cacheKey);
      if (cached) {
        this.logger.debug(`🟢 Collection ${id} fetched from cache`);
        return cached;
      }

      const collection = await this.collectionRepo.findOne({
        where: { id },
        relations: ['products'],
      });
      if (!collection) {
        this.logger.warn(`⚠️ Collection not found: ${id}`);
        throw new NotFoundException('Collection not found');
      }

      await this.redisCacheService.setCache(cacheKey, collection, 300);
      this.logger.debug(`🟡 Collection ${id} fetched from DB and cached`);
      return collection;
    } catch (error) {
      this.logger.error('❌ Failed to fetch collection by id', error.stack ?? error);
      throw new InternalServerErrorException('Failed to fetch collection');
    }
  }

  /**
   * Update a collection (name, description, product membership).
   * Uses transaction and invalidates related caches.
   */
  async updateCollection(id: string, dto: UpdateCollectionDto): Promise<Collection> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const existing = await queryRunner.manager.findOne(Collection, {
        where: { id },
        relations: ['products'],
      });
      if (!existing) throw new NotFoundException('Collection not found');

      if (dto.name !== undefined) existing.name = dto.name;
      if (dto.description !== undefined) existing.description = dto.description;

      if (dto.productIds && dto.productIds.length) {
        // fetch products and set relation
        const products = await this.productRepo.findByIds(dto.productIds);
        existing.products = products;
      }

      const saved = await queryRunner.manager.save(existing);
      await queryRunner.commitTransaction();

      // invalidate caches
      await this.redisCacheService.deleteCache(`collection:${id}`);
      await this.redisCacheService.deleteCache('collections:list');
      await this.redisCacheService.deleteByPrefix('products:');

      this.logger.log(`✅ Updated collection: ${saved.name}`);
      return saved;
    } catch (error) {
      await queryRunner.rollbackTransaction();

      this.logger.error('❌ Failed to update collection', error.stack ?? error);
      throw new InternalServerErrorException(
        `Failed to update collection: ${error?.message ?? error}`,
      );
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Soft delete collections (accepts array of ids).
   */
  async softDeleteCollections(ids: string[]): Promise<{ success: true; deleted: number }> {
    if (!ids?.length) throw new BadRequestException('No collection ids provided');

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const result = await queryRunner.manager.softDelete(Collection, ids);
      await queryRunner.commitTransaction();

      // invalidate caches
      await this.redisCacheService.deleteCache('collections:list');
      ids.forEach((id) => this.redisCacheService.deleteCache(`collection:${id}`));
      await this.redisCacheService.deleteByPrefix('products:');

      const deleted = result.affected ?? 0;
      this.logger.log(`🟠 Soft-deleted ${deleted} collection(s)`);
      return { success: true, deleted };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('❌ Failed to soft-delete collections', error.stack ?? error);
      throw new InternalServerErrorException('Failed to soft-delete collections');
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Permanently delete collections (and don't touch products).
   * Use carefully as this removes DB rows permanently.
   */
  async permanentDeleteCollections(ids: string[]): Promise<{ success: true; deleted: number }> {
    if (!ids?.length) throw new BadRequestException('No collection ids provided');

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // optional: detach products relation first if you want explicit cleanup
      // await queryRunner.manager.createQueryBuilder().relation(Collection, 'products').of(ids).remove(...);

      const result = await queryRunner.manager.delete(Collection, ids);
      await queryRunner.commitTransaction();

      await this.redisCacheService.deleteCache('collections:list');
      ids.forEach((id) => this.redisCacheService.deleteCache(`collection:${id}`));
      await this.redisCacheService.deleteByPrefix('products:');

      const deleted = result.affected ?? 0;
      this.logger.log(`💀 Permanently deleted ${deleted} collection(s)`);
      return { success: true, deleted };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('❌ Failed to permanently delete collections', error.stack ?? error);
      throw new InternalServerErrorException('Failed to permanently delete collections');
    } finally {
      await queryRunner.release();
    }
  }
}
