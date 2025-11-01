// backend/src/users/dto/user-response.dto.ts
import { Expose } from 'class-transformer';

export class UserResponseDto {
  @Expose()
  id: string;

  @Expose()
  email: string;

  @Expose()
  full_name?: string;

  @Expose()
  phone?: string;

  @Expose()
  avatar_url?: string;

  @Expose()
  is_email_verified: boolean;

  @Expose()
  role: string;

  @Expose()
  disabled: boolean;

  @Expose()
  created_at: Date;

  @Expose()
  updated_at: Date;
}
