//src/product/dto/category.dto.ts
import { IsString, IsOptional, IsNotEmpty} from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}

export class UpdateCategoryDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}