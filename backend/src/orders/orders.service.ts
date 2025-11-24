import {
  Injectable,
  NotFoundException,
  Logger,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { plainToInstance } from 'class-transformer';

import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import {
  CreateOrderDto,
  UpdateOrderStatusDto,
  OrderItemDto,
} from './dto/order.dto';
import { OrderResponseDto } from './dto/order-response.dto';

import { User } from 'src/users/entities/user.entity';
import { Address } from 'src/addresses/entities/address.entity';
import { ProductVariant } from 'src/product/entities/product-variant.entity';

import { RedisCacheService } from 'src/common/cache/redis-cache.service';
import { AuditService } from 'src/audit/audit.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  private readonly SHIPPING_BASE_RATE = 1000;

  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepo: Repository<OrderItem>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Address)
    private readonly addressRepo: Repository<Address>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    private readonly redisCache: RedisCacheService,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  // 📦 Calculate shipping fee
  calculateShippingFee(
    subtotal: number,
    items: OrderItemDto[],
    baseRate: number = this.SHIPPING_BASE_RATE,
  ): number {
    const totalWeight = items.reduce(
      (acc, item) => acc + item.quantity * (item.weight ?? 1),
      0,
    );

    let shippingFee = totalWeight * baseRate;
    if (subtotal >= 50000) shippingFee = 0;
    else if (subtotal >= 30000) shippingFee *= 0.5;

    return parseFloat(shippingFee.toFixed(2));
  }

  // 🛒 Create new order
  async createOrder(
    createOrderDto: CreateOrderDto,
    ip: string,
    userAgent: string,
  ) {
    try {
      const result = await this.dataSource.transaction(async (manager) => {
        const userRepo = manager.getRepository(User);
        const addressRepo = manager.getRepository(Address);
        const orderRepo = manager.getRepository(Order);
        const orderItemRepo = manager.getRepository(OrderItem);

        // 1️⃣ Validate User
        let user: User | undefined;
        if (createOrderDto.userId) {
          user =
            (await userRepo.findOne({
              where: { id: createOrderDto.userId },
            })) ?? undefined;
          if (!user)
            throw new NotFoundException(
              `User ${createOrderDto.userId} not found`,
            );
        }

        // 2️⃣ Validate Shipping Address
        let shippingAddress: Address | undefined;
        if (createOrderDto.shippingAddressId) {
          shippingAddress =
            (await addressRepo.findOne({
              where: { id: createOrderDto.shippingAddressId },
            })) ?? undefined;
          if (!shippingAddress)
            throw new NotFoundException(
              `Address ${createOrderDto.shippingAddressId} not found`,
            );
        }

        // 3️⃣ Prepare order items
        const items = createOrderDto.items.map((itemDto) =>
          orderItemRepo.create({
            ...(itemDto.productVariantId
              ? {
                  productVariant: {
                    id: itemDto.productVariantId,
                  } as ProductVariant,
                }
              : {}),
            productName: itemDto.productName,
            variantName: itemDto.variantName,
            unitPrice: itemDto.unitPrice,
            discountPerItem: itemDto.discountPerItem,
            quantity: itemDto.quantity,
            totalPrice:
              itemDto.totalPrice ??
              (itemDto.unitPrice - itemDto.discountPerItem) * itemDto.quantity,
            weight: itemDto.weight ?? 1,
          }),
        );

        // 4️⃣ Compute totals
        const subtotal =
          createOrderDto.subtotal ??
          items.reduce((sum, i) => sum + Number(i.totalPrice), 0);

        const shippingFee =
          createOrderDto.shippingFee ??
          this.calculateShippingFee(subtotal, createOrderDto.items);

        const discount = createOrderDto.discount ?? 0;
        const total = subtotal + shippingFee - discount;

        // 5️⃣ Save order
        const order = orderRepo.create({
          user,
          shippingAddress,
          items,
          subtotal,
          shippingFee,
          discount,
          total,
          status: 'pending',
          paymentStatus: 'unpaid',
          paymentReference: createOrderDto.paymentReference,
        });

        const savedOrder = await orderRepo.save(order);

        return plainToInstance(OrderResponseDto, savedOrder, {
          excludeExtraneousValues: true,
        });
      });

      // Post-commit side effects
      await this.redisCache.setCache(`order:${result.id}`, result);
      if (result.user?.id)
        await this.redisCache.deleteByPrefix(`user_orders:${result.user.id}`);

      await this.auditService.enqueueLog({
        action: 'CREATE_ORDER',
        userId: result.user?.id,
        ip,
        userAgent,
        metadata: { orderId: result.id },
      });

      this.logger.log(`✅ Order ${result.id} created successfully.`);
      return {
        success: true,
        message: 'Order created successfully',
        data: result,
      };
    } catch (error) {
      this.logger.error(`❌ Order creation failed: ${error.message}`);
      throw new InternalServerErrorException(
        'Order creation failed. Please try again later.',
      );
    }
  }

  // 🔍 Get single order
  async getOrderById(orderId: string) {
    const cacheKey = `order:${orderId}`;
    let order = await this.redisCache.getCache<Order>(cacheKey);

    if (!order) {
      order = await this.orderRepo.findOne({
        where: { id: orderId },
        relations: ['items', 'shippingAddress', 'user'],
      });
      if (!order) throw new NotFoundException(`Order ${orderId} not found`);
      await this.redisCache.setCache(cacheKey, order);
    }

    const dto = plainToInstance(OrderResponseDto, order, {
      excludeExtraneousValues: true,
    });

    return {
      success: true,
      message: 'Order fetched successfully',
      data: dto,
    };
  } 

  // 📦 Get all orders for a user
  async getOrdersByUser(userId: string) {
    const cacheKey = `user_orders:${userId}`;
    let orders = await this.redisCache.getCache<Order[]>(cacheKey);

    if (!orders) {
      orders = await this.orderRepo.find({
        where: { user: { id: userId } },
        relations: ['items', 'shippingAddress'],
        order: { createdAt: 'DESC' },
      });
      await this.redisCache.setCache(cacheKey, orders);
    }

    const dto = plainToInstance(OrderResponseDto, orders, {
      excludeExtraneousValues: true,
    });

    return {
      success: true,
      message: 'Orders retrieved successfully',
      data: dto,
    };
  }

  // 🧾 Update order status or payment
  async updateOrderStatus(
    orderId: string,
    updateDto: UpdateOrderStatusDto,
    ip: string,
    userAgent: string,
  ) {
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: ['items', 'user', 'shippingAddress'],
    });

    if (!order) throw new NotFoundException(`Order ${orderId} not found`);

    if (updateDto.status) order.status = updateDto.status;
    if (updateDto.paymentStatus) order.paymentStatus = updateDto.paymentStatus;
    if (updateDto.paymentReference)
      order.paymentReference = updateDto.paymentReference;

    const updatedOrder = await this.orderRepo.save(order);

    await this.redisCache.deleteCache(`order:${orderId}`);
    if (order.user)
      await this.redisCache.deleteByPrefix(`user_orders:${order.user.id}`);

    await this.auditService.enqueueLog({
      action: 'UPDATE_ORDER_STATUS',
      userId: order.user?.id,
      ip,
      userAgent,
      metadata: { orderId, updatedFields: updateDto },
    });

    const dto = plainToInstance(OrderResponseDto, updatedOrder, {
      excludeExtraneousValues: true,
    });

    return {
      success: true,
      message: 'Order updated successfully',
      data: dto,
    };
  }

  // ❌ Delete order
  async deleteOrder(orderId: string, ip: string, userAgent: string) {
    try {
      const order = await this.orderRepo.findOne({
        where: { id: orderId },
        relations: ['user'],
      });
      if (!order) throw new NotFoundException(`Order ${orderId} not found`);

      await this.orderRepo.remove(order);

      await this.redisCache.deleteCache(`order:${orderId}`);
      if (order.user?.id)
        await this.redisCache.deleteByPrefix(`user_orders:${order.user.id}`);

      await this.auditService.enqueueLog({
        action: 'DELETE_ORDER',
        userId: order.user?.id,
        ip,
        userAgent,
        metadata: { orderId },
      });

      this.logger.log(`🗑️ Order ${orderId} deleted successfully.`);
      return {
        success: true,
        message: 'Order deleted successfully',
        data: null,
      };
    } catch (error) {
      this.logger.error(`❌ Failed to delete order: ${error.message}`);
      throw new InternalServerErrorException(
        'Failed to delete order. Please try again later.',
      );
    }
  }
}
