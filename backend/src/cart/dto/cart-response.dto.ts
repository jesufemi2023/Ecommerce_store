import { Expose, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CartItemResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

 // @ApiProperty()
  //@Expose()
  //variantId: string;

  @ApiProperty()
  @Expose()
  productName: string;

  @ApiProperty()
  @Expose()
  variantLabel: string;

  @ApiProperty()
  @Expose()
  productImage: string | null;

  @ApiProperty()
  @Expose()
  quantity: number;

  @ApiProperty()
  @Expose()
  unitPrice: number;

  @ApiProperty()
  @Expose()
  totalPrice: number;
}

export class CartResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  status: string;

  @ApiProperty()
  @Expose()
  totalItems: number;

  @ApiProperty()
  @Expose()
  totalAmount: number;

  @ApiProperty({ type: [CartItemResponseDto] })
  @Expose()
  @Type(() => CartItemResponseDto)
  items: CartItemResponseDto[];
}
