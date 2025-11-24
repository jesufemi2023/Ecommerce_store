// src/orders/dto/order-response.dto.ts
import { Expose, Type } from 'class-transformer';

export class OrderUserResponseDto {
  @Expose() id: string;
  @Expose() full_name: string;
  @Expose() phone: string;
  @Expose() email: string;
}

export class OrderItemResponseDto {
  @Expose() id: string;
  @Expose() productName: string;
  @Expose() variantName: string;
  @Expose() unitPrice: number;
  @Expose() discountPerItem: number;
  @Expose() quantity: number;
  @Expose() weight: number;
  @Expose() totalPrice: number;
}

export class OrderResponseDto {
  @Expose() id: string;

  @Expose()
  @Type(() => OrderUserResponseDto)
  user?: OrderUserResponseDto;

  @Expose()
  @Type(() => OrderItemResponseDto)
  items: OrderItemResponseDto[];

  @Expose() subtotal: number;
  @Expose() shippingFee: number;
  @Expose() discount: number;
  @Expose() total: number;
  @Expose() status: string;
  @Expose() paymentStatus: string;
  @Expose() paymentReference?: string;
  @Expose() createdAt: Date;
  @Expose() updatedAt: Date;
}
