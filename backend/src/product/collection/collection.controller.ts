import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/users/entities/user.entity';
import { CollectionsService } from './collection.service';
import {
  CreateCollectionDto,
  UpdateCollectionDto,
} from '../dto/collection.dto';

@ApiTags('Collections')
@ApiBearerAuth()
@Controller('collections')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CollectionsController {
  private readonly logger = new Logger(CollectionsController.name);

  constructor(private readonly collectionsService: CollectionsService) {}

  /** Create collection (admin only) */
  @Post()
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateCollectionDto) {
    try {
      const created = await this.collectionsService.createCollection(dto);
      return { message: 'Collection created successfully', data: created };
    } catch (error) {
      this.logger.error('❌ Failed to create collection', error.stack ?? error);
      throw new BadRequestException(
        error.message || 'Failed to create collection',
      );
    }
  }

  /** Get collections (with pagination & optional search) */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
  ) {
    const response = await this.collectionsService.getCollections({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search,
    });
    return { message: 'Collections fetched successfully', ...response };
  }

  /** Get single collection */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id') id: string) {
    try {
      const collection = await this.collectionsService.getCollectionById(id);
      return { message: 'Collection fetched successfully', data: collection };
    } catch (error) {
      this.logger.error(
        `❌ Failed to fetch collection ${id}`,
        error.stack ?? error,
      );
      throw new BadRequestException(
        error.message || 'Failed to fetch collection',
      );
    }
  }

  /** Update collection (admin only) */
  @Put(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async update(@Param('id') id: string, @Body() dto: UpdateCollectionDto) {
    try {
      const updated = await this.collectionsService.updateCollection(id, dto);
      return { message: 'Collection updated successfully', data: updated };
    } catch (error) {
      this.logger.error(
        `❌ Failed to update collection ${id}`,
        error.stack ?? error,
      );
      throw new BadRequestException(
        error.message || 'Failed to update collection',
      );
    }
  }

  /** Soft delete collections (admin only, accepts array of ids in body) */
  @Delete('soft')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async softDelete(@Body('ids') ids: string[]) {
    try {
      const result = await this.collectionsService.softDeleteCollections(ids);
      return { message: 'Collections soft-deleted', ...result };
    } catch (error) {
      this.logger.error(
        '❌ Failed to soft-delete collections',
        error.stack ?? error,
      );
      throw new BadRequestException(
        error.message || 'Failed to soft-delete collections',
      );
    }
  }

  /** Permanent delete collections (admin only) */
  @Delete('permanent')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async permanentDelete(@Body('ids') ids: string[]) {
    try {
      const result =
        await this.collectionsService.permanentDeleteCollections(ids);
      return { message: 'Collections permanently deleted', ...result };
    } catch (error) {
      this.logger.error(
        '❌ Failed to permanently delete collections',
        error.stack ?? error,
      );
      throw new BadRequestException(
        error.message || 'Failed to permanently delete collections',
      );
    }
  }
}
