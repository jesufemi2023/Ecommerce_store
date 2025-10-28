import { IsString, IsNotEmpty } from 'class-validator';

export class VerifyResetTokenDto {
  @IsString()
  @IsNotEmpty()
  token: string;
}
