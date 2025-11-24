//src/cart/dto/cart.dto.ts
import { IsUUID, IsInt, Min, IsArray, ArrayNotEmpty } from 'class-validator';

/**
 * Add a variant to cart
 */
export class AddToCartDto {
  @IsUUID()
  variantId: string;

  @IsInt()
  @Min(1)
  quantity: number;
}

/**
 * Remove an item from cart
 */
export class RemoveCartItemDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  cartItemId: string[];
}
