// src/orders/orders.controller.ts
import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  Delete,
  Put,
  Req,
  Logger,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto, UpdateOrderStatusDto } from './dto/order.dto';
import type { Request } from 'express';
import { OrdersResponseInterceptor } from './interceptors/orders-response.interceptor';
import { UseInterceptors } from '@nestjs/common';

@UseInterceptors(OrdersResponseInterceptor)
@Controller('orders')
export class OrdersController {
  private readonly logger = new Logger(OrdersController.name);

  constructor(private readonly ordersService: OrdersService) {}

  /**
   * ✅ Create a new order
   */
  @Post()
  async createOrder(
    @Body() createOrderDto: CreateOrderDto,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'N/A';
    const userAgent = req.headers['user-agent'] || 'N/A';
    return this.ordersService.createOrder(
      createOrderDto,
      ip.toString(),
      userAgent.toString(),
    );
  }

  /**
   * ✅ Get single order by ID
   */
  @Get(':id')
  async getOrder(@Param('id') orderId: string) {
    return this.ordersService.getOrderById(orderId);
  }

  /**
   * ✅ Get all orders for a specific user
   */
  @Get('user/:userId')
  async getOrdersByUser(@Param('userId') userId: string) {
    return this.ordersService.getOrdersByUser(userId);
  }

  /**
   * ✅ Update order status and/or payment status
   */
  @Put(':id/status')
  async updateOrderStatus(
    @Param('id') orderId: string,
    @Body() updateOrderDto: UpdateOrderStatusDto,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'N/A';
    const userAgent = req.headers['user-agent'] || 'N/A';
    return this.ordersService.updateOrderStatus(
      orderId,
      updateOrderDto,
      ip.toString(),
      userAgent.toString(),
    );
  }

  /**
   * ✅ Delete an order
   */
  @Delete(':id')
  async deleteOrder(@Param('id') orderId: string, @Req() req: Request) {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'N/A';
    const userAgent = req.headers['user-agent'] || 'N/A';

    return this.ordersService.deleteOrder(
      orderId,
      ip.toString(),
      userAgent.toString(),
    );
  }
}
