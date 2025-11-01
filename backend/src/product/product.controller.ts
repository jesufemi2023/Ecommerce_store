// src/product/product.controller.ts
import {
  Controller,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/users/entities/user.entity';
import { CreateProductDto } from './dto/product.dto';
import { ProductsService } from './product.service';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';

/**
 * ProductsController
 * ------------------
 * Exposes REST endpoints for managing products.
 * Only ADMIN users can create products.
 */
@ApiTags('Products')
@ApiBearerAuth()
@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard) // ✅ Enforce authentication + role guard globally for this controller
export class ProductsController {
  private readonly logger = new Logger(ProductsController.name);

  constructor(private readonly productsService: ProductsService) {}

  /**
   * Create a new product
   * ---------------------
   * Accepts multipart/form-data with fields:
   * - name: string
   * - description: string (optional)
   * - categoryId: string (UUID)
   * - collectionIds[]: string[] (optional)
   * - discount: number (optional)
   * - variants[]: JSON (array of variants)
   * - images[]: file (multiple image uploads)
   * 
   * Only ADMIN users can perform this action.
   */
  @Post()
  @Roles(UserRole.ADMIN) // ✅ Restrict to admin users only
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FilesInterceptor('images', 10, {
      storage: diskStorage({
        destination: './uploads/temp',
        filename: (req, file, cb) => {
          const uniqueName = `${Date.now()}-${file.originalname}`;
          cb(null, uniqueName);
        },
      }),
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description:
      'Create a product with images, variants, and collections. Accepts form-data.',
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
      // 🔍 Validate variants format (must be JSON array if present)
      let parsedVariants = [];
      if (body.variants) {
        try {
          parsedVariants = JSON.parse(body.variants);
        } catch (err) {
          throw new BadRequestException(
            'Invalid JSON format for variants field',
          );
        }
      }

      // 🧱 Construct DTO from form-data
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

      // 💾 Delegate business logic to service layer
      const product = await this.productsService.createProduct(dto, files);

      this.logger.log(`✅ Product created: ${product.name}`);
      return {
        message: 'Product created successfully',
        data: product,
      };
    } catch (error) {
      this.logger.error('❌ Failed to create product', error.stack);
      throw new BadRequestException(error.message || 'Failed to create product');
    }
  }
}
