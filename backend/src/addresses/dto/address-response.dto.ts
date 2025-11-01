import { Expose, Type } from 'class-transformer';

export class AddressResponseDto {
  @Expose()
  id: string;

  @Expose()
  label: string;

  @Expose()
  street_address: string;

  @Expose()
  city: string;

  @Expose()
  state: string;

  @Expose()
  postal_code?: string;

  @Expose()
  country: string;

  @Expose()
  is_default: boolean;

  @Expose()
  @Type(() => Date)
  created_at: Date;

  @Expose()
  @Type(() => Date)
  updated_at: Date;
}
