import { IsEmail, IsNotEmpty, IsOptional, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @MinLength(5, { message: 'Password must be at least 5 characters' })
  password: string;

  @IsOptional()
  full_name?: string;
}
