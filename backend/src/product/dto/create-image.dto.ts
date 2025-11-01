import { IsString, IsOptional, IsBoolean} from 'class-validator';

export class CreateProductImageDto {
  @IsString()
  imageUrl: string; // secure_url returned from Cloudinary

  @IsString()
  publicId: string; // public_id from Cloudinary

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
