// order.dto.ts
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
  Min,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Optional } from '@nestjs/common';

export class OrderItemDto {
  @IsUUID()
  @IsOptional()
  productVariantId?: string;

  @IsString()
  @IsNotEmpty()
  productName: string;

  @IsString()
  @IsNotEmpty()
  variantName: string;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsNumber()
  @Min(0)
  discountPerItem: number;

  @IsOptional()
  @IsNumber()
  weight?: number;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  totalPrice: number;
}

/**
 * DTO for creating a new order
 * Supports guest checkout, promo codes, gift wrapping, and dynamic shipping
 */
export class CreateOrderDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @IsUUID()
  @IsOptional()
  shippingAddressId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  subtotal?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  shippingFee?: number;

  @IsOptional()
  @IsNumber()
  discount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  total?: number;

  @IsOptional()
  @IsString()
  paymentReference?: string;

  // ✅ Optional promo code
  @IsOptional()
  @IsString()
  promoCode?: string;

  // ✅ Optional gift wrapping flag
  @IsOptional()
  giftWrap?: boolean;

  // ✅ Optional dynamic shipping calculation
  @IsOptional()
  @IsNumber()
  @Min(0)
  dynamicShippingFee?: number;
}

/**
 * DTO for updating order status
 */
export class UpdateOrderStatusDto {
  @IsEnum(['pending', 'processing', 'shipped', 'delivered', 'cancelled'])
  status:
    | 'pending'
    | 'processing'
    | 'shipped'
    | 'delivered'
    | 'cancelled';

  @IsOptional()
  @IsEnum(['unpaid', 'paid', 'refunded'])
  paymentStatus?: 'unpaid' | 'paid' | 'refunded';

  @IsOptional()
  @IsString()
  paymentReference?: string;
}
