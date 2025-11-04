// src/product/category/category.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Category } from '../entities/category.entity';
import { CreateCategoryDto, UpdateCategoryDto } from '../dto/category.dto';

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
  ) {}

  /** 🟢 Create a new category */
  async createCategory(dto: CreateCategoryDto): Promise<Category> {
    const exists = await this.categoryRepo.findOne({
      where: { name: ILike(dto.name) },
    });
    if (exists) throw new BadRequestException('Category already exists');

    const category = this.categoryRepo.create({ name: dto.name.trim() });
    return await this.categoryRepo.save(category);
  }

  /** 🟡 Get all categories (with optional search) */
  async getAllCategories(search?: string): Promise<Category[]> {
    const where = search ? { name: ILike(`%${search}%`) } : {};
    return await this.categoryRepo.find({
      where,
      order: { name: 'ASC' },
      relations: ['products'],
    });
  }

  /** 🔵 Get category by ID */
  async getCategoryById(id: string): Promise<Category> {
    const category = await this.categoryRepo.findOne({
      where: { id },
      relations: ['products'],
    });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  /** 🟣 Update category */
  async updateCategory(id: string, dto: UpdateCategoryDto): Promise<Category> {
    const category = await this.getCategoryById(id);
    category.name = dto.name.trim();
    return await this.categoryRepo.save(category);
  }

  /** 🔴 Soft delete (single or batch) */
  async softDelete(ids: string[]): Promise<{ deleted: number }> {
    const result = await this.categoryRepo.softDelete(ids);
    return { deleted: result.affected || 0 };
  }

  /** ⚫ Permanently delete (admin only) */
  async hardDelete(ids: string[]): Promise<{ deleted: number }> {
    const result = await this.categoryRepo.delete(ids);
    return { deleted: result.affected || 0 };
  }
}
