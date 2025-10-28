// src/auth/dto/verified-user.dto.ts
import { Exclude, Expose } from 'class-transformer';

export class VerifiedUserDto {
  @Expose()
  id: string;

  @Expose()
  email: string;

  @Expose()
  full_name: string;

  @Exclude()
  password_hash?: string;

  @Exclude()
  created_at?: Date;

  @Exclude()
  updated_at?: Date;

  constructor(partial: Partial<VerifiedUserDto>) {
    Object.assign(this, partial);
  }
}
