import {
  Controller,
  Post,
  Delete,
  Get,
  Body,
  Req,
  UseGuards,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import type { Request } from 'express';
import { CartService } from './cart.service';
import { AddToCartDto, RemoveCartItemDto } from './dto/cart.dto';
import { CartResponseDto } from './dto/cart-response.dto';
import { ApiResponseDto } from 'src/common/dto/api-response.dto';
import { plainToInstance } from 'class-transformer';
import { User } from 'src/users/entities/user.entity';

@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  /**
   * 🛒 Add item to cart
   */
  @Post('add')
  async addToCart(@Req() req: Request, @Body() dto: AddToCartDto) {
    const user = req.user as User;
    const ip = req.ip;
    const userAgent = req.headers['user-agent'];

    const cart = await this.cartService.addToCart(user, dto, ip, userAgent);

    const response = plainToInstance(CartResponseDto, cart, {
      excludeExtraneousValues: true,
    });

    return new ApiResponseDto(HttpStatus.OK, 'Item added to cart successfully', response);
  }

  /**
   * ❌ Remove one or more items from cart
   */
  @Delete('remove')
  @HttpCode(HttpStatus.OK)
  async removeItems(@Req() req: Request, @Body() dto: RemoveCartItemDto) {
    const user = req.user as User;
    const ip = req.ip;
    const userAgent = req.headers['user-agent'];

    const cart = await this.cartService.removeItemsFromCart(user, dto, ip, userAgent);

    const response = plainToInstance(CartResponseDto, cart, {
      excludeExtraneousValues: true,
    });

    return new ApiResponseDto(
      HttpStatus.OK,
      'Selected item(s) removed successfully',
      response,
    );
  }

  /**
   * 🧹 Clear all items from user's cart
   */
  @Delete('clear')
  @HttpCode(HttpStatus.OK)
  async clearCart(@Req() req: Request) {
    const user = req.user as User;
    const ip = req.ip;
    const userAgent = req.headers['user-agent'];

    const cart = await this.cartService.clearCart(user, ip, userAgent);

    const response = plainToInstance(CartResponseDto, cart, {
      excludeExtraneousValues: true,
    });

    return new ApiResponseDto(
      HttpStatus.OK,
      'All items cleared from cart successfully',
      response,
    );
  }

  /**
   * 🧾 Get current user's active cart
   */
  @Get()
  async getCart(@Req() req: Request) {
    const user = req.user as User;
    const cart = await this.cartService.getCartByUser(user);

    const response = plainToInstance(CartResponseDto, cart, {
      excludeExtraneousValues: true,
    });

    return new ApiResponseDto(HttpStatus.OK, 'Active cart fetched successfully', response);
  }
}
