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
  Delete,
  BadRequestException,
  NotFoundException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/users/entities/user.entity';
import { CreateProductDto } from './dto/product.dto';
import { ProductsService } from './product.service';
import { CreateVariantDto, UpdateVariantDto } from './dto/variant.dto';
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
  @UseInterceptors(FilesInterceptor('images', 10, { storage: memoryStorage() }))
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
        images: { type: 'array', items: { type: 'string', format: 'binary' } },
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
          throw new BadRequestException('Invalid JSON for variants');
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
    const response = await this.productsService.getProducts({
      page: Number(page) || 1,
      limit: Number(limit) || 10,
      search,
      categoryId,
      collectionId,
    });
    this.logger.log(`📦 ${response.data.length} products retrieved`);
    return { message: 'Products fetched successfully', ...response };
  }

  // ============================================================
  // 🟨 GET PRODUCT BY ID
  // ============================================================
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getProductById(@Param('id') id: string) {
    const product = await this.productsService.getProductById(id);
    this.logger.log(`📦 Product retrieved: ${product.name}`);
    return { message: 'Product fetched successfully', data: product };
  }

  // ============================================================
  // 🟧 UPDATE PRODUCT
  // ============================================================
  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FilesInterceptor('images', 10, { storage: memoryStorage() }))
  @ApiConsumes('multipart/form-data')
  async updateProduct(
    @Param('id') id: string,
    @Body() body: any,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    let parsedVariants = [];
    if (body.variants) {
      try {
        parsedVariants = JSON.parse(body.variants);
      } catch {
        throw new BadRequestException('Invalid JSON for variants');
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
    return { message: 'Product updated successfully', data: updatedProduct };
  }

  // ============================================================
  // 🟦 GET ALL VARIANTS OF A PRODUCT
  // ============================================================
  @Get(':id/variants')
  @HttpCode(HttpStatus.OK)
  async getVariants(@Param('id') productId: string) {
    const variants = await this.productsService.getVariantsByProduct(productId);
    this.logger.log(
      `📦 Retrieved ${variants.length} variants for product ${productId}`,
    );
    return { message: 'Variants fetched successfully', data: variants };
  }

  // ============================================================
  // 🟩 ADD VARIANT TO PRODUCT
  // ============================================================
  @Post(':productId/variants')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async addVariantToProduct(
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Body() dto: Partial<CreateVariantDto>,
  ) {
    const variant = await this.productsService.addVariantToProduct(
      productId,
      dto,
    );
    this.logger.log(`✅ Variant added to product ${productId}`);
    return { message: 'Variant added successfully', data: variant };
  }

  // ============================================================
  // 🟨 UPDATE VARIANT
  // ============================================================
  @Patch(':productId/variants/:variantId')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async updateProductVariant(
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Param('variantId', new ParseUUIDPipe()) variantId: string,
    @Body() dto: Partial<UpdateVariantDto>,
  ) {
    const updated = await this.productsService.updateProductVariant(
      productId,
      variantId,
      dto,
    );
    this.logger.log(`🛠 Updated variant ${variantId} for product ${productId}`);
    return { message: 'Variant updated successfully', data: updated };
  }

  // ============================================================
  // 🟥 DELETE VARIANT
  // ============================================================
  @Delete(':productId/variants/:variantId')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async deleteVariant(
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
    @Query('permanently') permanently?: string,
  ) {
    await this.productsService.deleteProductVariants(
      productId,
      [variantId],
      permanently === 'true',
    );
    this.logger.log(
      `🗑 Deleted variant ${variantId} from product ${productId}`,
    );
    return { message: 'Variant deleted successfully' };
  }

  // ============================================================
  // 🟥 DELETE PRODUCTS (Bulk or Single)
  // ============================================================
  @Delete()
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async deleteProducts(
    @Query('ids') ids: string,
    @Query('permanently') permanently?: string,
  ) {
    const productIds = ids.split(','); // comma-separated string from query
    await this.productsService.deleteProducts(
      productIds,
      permanently === 'true',
    );
    this.logger.log(`🗑 Deleted products: ${productIds.join(', ')}`);
    return { message: 'Products deleted successfully' };
  }
}
