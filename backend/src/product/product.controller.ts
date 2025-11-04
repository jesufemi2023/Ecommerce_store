import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Query,
  Body,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/users/entities/user.entity';
import { CreateProductDto } from './dto/product.dto';
import { ProductsService } from './product.service';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('Products')
@ApiBearerAuth()
@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductsController {
  private readonly logger = new Logger(ProductsController.name);

  constructor(private readonly productsService: ProductsService) {}

  // ============================================================
  // 🟩 CREATE PRODUCT
  // ============================================================
  @Post()
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FilesInterceptor('images', 10, {
      storage: memoryStorage(), // ✅ store in memory instead of disk
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Create a product with images, variants, and collections.',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'Nike Air Max 2024' },
        description: { type: 'string', example: 'Stylish running shoes' },
        categoryId: { type: 'string', format: 'uuid' },
        collectionIds: {
          type: 'array',
          items: { type: 'string', format: 'uuid' },
        },
        discount: { type: 'number', example: 10 },
        variants: {
          type: 'string',
          example:
            '[{"sku":"NIKE-001","size":"42","color":"Black","stock":20,"price":75000}]',
        },
        images: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  async createProduct(
    @Body() body: any,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    try {
      let parsedVariants = [];
      if (body.variants) {
        try {
          parsedVariants = JSON.parse(body.variants);
        } catch {
          throw new BadRequestException(
            'Invalid JSON format for variants field',
          );
        }
      }

      const dto: CreateProductDto = {
        name: body.name,
        description: body.description,
        categoryId: body.categoryId,
        collectionIds: Array.isArray(body.collectionIds)
          ? body.collectionIds
          : body.collectionIds
          ? [body.collectionIds]
          : [],
        discount: body.discount ? Number(body.discount) : 0,
        variants: parsedVariants,
      };

      const product = await this.productsService.createProduct(dto, files);
      this.logger.log(`✅ Product created: ${product.name}`);

      return { message: 'Product created successfully', data: product };
    } catch (error) {
      this.logger.error('❌ Failed to create product', error.stack);
      throw new BadRequestException(
        error.message || 'Failed to create product',
      );
    }
  }

  // ============================================================
  // 🟦 GET PRODUCTS (with filters, pagination, search)
  // ============================================================
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiQuery({ name: 'search', required: false, example: 'shoes' })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'collectionId', required: false })
  async getProducts(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('collectionId') collectionId?: string,
  ) {
    try {
      const response = await this.productsService.getProducts({
        page: Number(page) || 1,
        limit: Number(limit) || 10,
        search,
        categoryId,
        collectionId,
      });

      this.logger.log(`📦 ${response.data.length} products retrieved`);
      return {
        message: 'Products fetched successfully',
        ...response,
      };
    } catch (error) {
      this.logger.error('❌ Failed to fetch products', error.stack);
      throw new BadRequestException('Failed to fetch products');
    }
  }

  // ============================================================
  // 🟨 GET PRODUCT BY ID
  // ============================================================
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getProductById(@Param('id') id: string) {
    try {
      const product = await this.productsService.getProductById(id);
      this.logger.log(`📦 Product retrieved: ${product.name}`);
      return {
        message: 'Product fetched successfully',
        data: product,
      };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`❌ Failed to fetch product ${id}`, error.stack);
      throw new BadRequestException('Failed to fetch product');
    }
  }

  // ============================================================
  // 🟧 UPDATE PRODUCT
  // ============================================================
  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(
    FilesInterceptor('images', 10, {
      storage: memoryStorage(), // ✅ use memory storage for ImageKit
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Update a product. You can include new images and variants.',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'Updated Nike Air Max 2025' },
        description: { type: 'string', example: 'Improved running shoes' },
        categoryId: { type: 'string', format: 'uuid' },
        collectionIds: {
          type: 'array',
          items: { type: 'string', format: 'uuid' },
        },
        discount: { type: 'number', example: 15 },
        variants: {
          type: 'string',
          example:
            '[{"sku":"NIKE-002","size":"43","color":"White","stock":30,"price":78000}]',
        },
        images: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  async updateProduct(
    @Param('id') id: string,
    @Body() body: any,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    try {
      let parsedVariants = [];
      if (body.variants) {
        try {
          parsedVariants = JSON.parse(body.variants);
        } catch {
          throw new BadRequestException('Invalid JSON format for variants');
        }
      }

      const dto: Partial<CreateProductDto> = {
        name: body.name,
        description: body.description,
        categoryId: body.categoryId,
        collectionIds: Array.isArray(body.collectionIds)
          ? body.collectionIds
          : body.collectionIds
          ? [body.collectionIds]
          : [],
        discount: body.discount ? Number(body.discount) : undefined,
        variants: parsedVariants,
      };

      const updatedProduct = await this.productsService.updateProduct(
        id,
        dto,
        files,
      );

      this.logger.log(`✅ Product updated: ${updatedProduct.name}`);
      return {
        message: 'Product updated successfully',
        data: updatedProduct,
      };
    } catch (error) {
      this.logger.error(`❌ Failed to update product ${id}`, error.stack);
      throw new BadRequestException(
        error.message || 'Failed to update product',
      );
    }
  }
}
