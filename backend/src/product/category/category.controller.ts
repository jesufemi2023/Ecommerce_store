// src/product/category/category.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/users/entities/user.entity';
import { CategoryService } from './category.service';
import { CreateCategoryDto, UpdateCategoryDto } from '../dto/category.dto';

@ApiTags('Categories')
@ApiBearerAuth()
@Controller('categories')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  /** 🟢 Create new category (ADMIN only) */
  @Post()
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateCategoryDto) {
    try {
      const category = await this.categoryService.createCategory(dto);
      return { message: 'Category created successfully', data: category };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  /** 🟡 Get all categories (any authenticated user) */
  @Get()
  @ApiQuery({ name: 'search', required: false })
  async findAll(@Query('search') search?: string) {
    const categories = await this.categoryService.getAllCategories(search);
    return { count: categories.length, data: categories };
  }

  /** 🔵 Get single category */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const category = await this.categoryService.getCategoryById(id);
    return { data: category };
  }

  /** 🟣 Update category (ADMIN only) */
  @Put(':id')
  @Roles(UserRole.ADMIN)
  async update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    const category = await this.categoryService.updateCategory(id, dto);
    return { message: 'Category updated successfully', data: category };
  }

  /** 🔴 Soft delete category(s) (ADMIN only) */
  @Delete('soft')
  @Roles(UserRole.ADMIN)
  async softDelete(@Body('ids') ids: string[]) {
    if (!ids?.length) throw new BadRequestException('No IDs provided');
    return await this.categoryService.softDelete(ids);
  }

  /** ⚫ Permanent delete (ADMIN only) */
  @Delete('permanent')
  @Roles(UserRole.ADMIN)
  async hardDelete(@Body('ids') ids: string[]) {
    if (!ids?.length) throw new BadRequestException('No IDs provided');
    return await this.categoryService.hardDelete(ids);
  }
}
