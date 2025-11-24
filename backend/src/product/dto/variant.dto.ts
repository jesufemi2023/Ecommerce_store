// src/product/dto/variant.dto.ts
import { IsNumber, IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class CreateVariantDto {
  @IsNumber()
  @IsNotEmpty()
  price: number; // ✅ required

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  size?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsNumber()
  stock?: number;

  @IsOptional()
  @IsString()
  weight?: string;

  @IsOptional()
  @IsString()
  dimensions?: string;

  @IsOptional()
  @IsString()
  name?: string;


  @IsOptional()
  @IsNumber()
  discount?: number;
}

export class UpdateVariantDto {
  @IsOptional()
  @IsNumber()
  @IsNotEmpty()
  price: number; // ✅ required

  
  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  size?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsNumber()
  stock?: number;

  @IsOptional()
  @IsString()
  weight?: string;

  @IsOptional()
  @IsString()
  dimensions?: string;

  @IsOptional()
  @IsString()
  variantName?: string;

  @IsOptional()
  @IsNumber()
  discount?: number;
}
