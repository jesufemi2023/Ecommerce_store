import {
  IsOptional,
  IsString,
  IsUrl,
  IsEmail,
  Matches,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * DTO for updating user information.
 * Supports partial updates — user can change any subset of fields.
 */
export class UpdateUserDto {
  /**
   * User's full name
   */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  full_name?: string;

  /**
   * International phone number (accepts +, -, space, brackets)
   */
  @IsOptional()
  @Matches(/^\+?[0-9\s\-()]{7,20}$/, {
    message: 'Invalid phone number format',
  })
  phone?: string;

  /**
   * Avatar URL (optional if uploading via file)
   */
  @IsOptional()
  @IsUrl({}, { message: 'avatar_url must be a valid URL' })
  avatar_url?: string;

  /**
   * Email update (requires re-verification)
   */
  @IsOptional()
  @IsEmail({}, { message: 'Invalid email format' })
  @Transform(({ value }) => value?.trim().toLowerCase())
  email?: string;

  /**
   * Password update (requires validation)
   */
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  new_password?: string; // renamed for clarity

  @IsOptional()
  @IsString()
  old_password?: string; // required if updating password
}
