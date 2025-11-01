import {
  IsString,
  IsOptional,
  IsArray,
  ArrayUnique,
  IsUUID
} from 'class-validator';

export class CreateCollectionDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @ArrayUnique()
  @IsOptional()
  productIds?: string[];
}

export class UpdateCollectionDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  productIds?: string[];
}
