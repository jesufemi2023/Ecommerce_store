import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { VariantService } from './variant.service';
import { CreateVariantDto, UpdateVariantDto } from '../dto/variant.dto';

@Controller('variants')
export class VariantController {
  constructor(private readonly variantService: VariantService) {}

  @Post()
  create(@Body() dto: CreateVariantDto) {
    return this.variantService.createVariant(dto);
  }

  @Get()
  getAll(@Query('productId') productId?: string) {
    return this.variantService.getVariants(productId);
  }

  @Get(':id')
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.variantService.getVariantById(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVariantDto,
  ) {
    return this.variantService.updateVariant(id, dto);
  }

  @Delete(':id')
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.variantService.deleteVariant(id);
  }
}
