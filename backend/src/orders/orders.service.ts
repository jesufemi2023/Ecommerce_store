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

// already present imports...
import { Cart } from 'src/cart/entities/cart.entity';
import { CartItem } from 'src/cart/entities/cart-item.entity';
import { CartStatus } from 'src/cart/entities/cart.entity';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  private readonly SHIPPING_BASE_RATE = 0.1;
  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepo: Repository<OrderItem>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Address)
    private readonly addressRepo: Repository<Address>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    @InjectRepository(Cart) private readonly cartRepo: Repository<Cart>, // <-- added
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
    if (subtotal <= 10000) shippingFee = 0;
    else if (subtotal >= 30000) shippingFee *= 0.5;

    return parseFloat(shippingFee.toFixed(2));
  }
  // 🛒 Create new order (cart-driven only — frontend must not send items)
  async createOrder(
    createOrderDto: CreateOrderDto,
    ip: string,
    userAgent: string,
  ) {
    if (!createOrderDto.userId) {
      throw new BadRequestException(
        'userId is required for checkout. Guest checkout requires a separate flow.',
      );
    }

    try {
      const result = await this.dataSource.transaction(async (manager) => {
        const userRepo = manager.getRepository(User);
        const addressRepo = manager.getRepository(Address);
        const orderRepo = manager.getRepository(Order);
        const orderItemRepo = manager.getRepository(OrderItem);
        const cartRepo = manager.getRepository(Cart);
        const variantRepo = manager.getRepository(ProductVariant);

        const user = await userRepo.findOne({
          where: { id: createOrderDto.userId },
        });
        if (!user)
          throw new NotFoundException(
            `User ${createOrderDto.userId} not found`,
          );

        const cart = await cartRepo.findOne({
          where: { user: { id: user.id }, status: CartStatus.ACTIVE },
          relations: [
            'items',
            'items.variant',
            'items.variant.product',
            'items.variant.product.images',
            'items.variant.product.category',
          ],
        });

        if (!cart)
          throw new NotFoundException('Active cart not found for user');
        if (!cart.items?.length) throw new BadRequestException('Cart is empty');

        const orderItems: OrderItem[] = [];

        for (const ci of cart.items) {
          if (!ci.variant) {
            this.logger.warn(`CartItem ${ci.id} has no variant, skipping`);
            continue;
          }

          const lockedVariant = await variantRepo
            .createQueryBuilder('v')
            .setLock('pessimistic_write')
            .where('v.id = :id', { id: ci.variant.id })
            .getOne();

          if (!lockedVariant || lockedVariant.stock < ci.quantity) {
            throw new BadRequestException(
              `Variant ${ci.variant.id} is out of stock`,
            );
          }

          const product = ci.variant.product;
          const productImage =
            product?.images?.find((img: any) => img.isPrimary)?.imageUrl ??
            product?.images?.[0]?.imageUrl ??
            null;

          const orderItem = orderItemRepo.create({
            productVariant: { id: ci.variant.id } as any,
            productName: product?.name ?? ci.productName ?? 'Unknown Product',
            variantName: ci.variant.name ?? ci.variantLabel ?? '',
            sku: ci.variant.sku ?? null,
            productImage,
            categoryName: product?.category?.name ?? null,
            unitPrice: Number(ci.unitPrice),
            discountPerItem: 0,
            quantity: ci.quantity,
            weight: Number(ci.variant.weight ?? 1),
            totalPrice: Number(ci.totalPrice),
          });

          orderItems.push(orderItem);
        }

        if (!orderItems.length)
          throw new BadRequestException('No valid order items found');

        const subtotal =
          Number(cart.totalAmount) ||
          orderItems.reduce((sum, it) => sum + Number(it.totalPrice), 0);

        const shippingFee =
          createOrderDto.shippingFee ??
          this.calculateShippingFee(subtotal, orderItems);
        const discount = createOrderDto.discount ?? 0;
        const total = subtotal + shippingFee - discount;

        const order = orderRepo.create({
          user,
          shippingAddress: createOrderDto.shippingAddressId
            ? ({ id: createOrderDto.shippingAddressId } as Address)
            : undefined,
          items: orderItems,
          subtotal,
          shippingFee,
          discount,
          total,
          status: 'pending',
          paymentStatus: 'unpaid',
        });

        const savedOrder = await orderRepo.save(order);

        if (cart.isLocked === false) {
          cart.isLocked = true;
          await cartRepo.save(cart);
        }

        return plainToInstance(OrderResponseDto, savedOrder, {
          excludeExtraneousValues: true,
        });
      });

      // Post-transaction cache and audit
      await this.redisCache.setCache(`order:${result.id}`, result);

      if (result.user?.id) {
        await this.redisCache.deleteByPrefix(`user_orders:${result.user.id}`);
        await this.redisCache.deleteCache(`cart:user:${result.user.id}`);
      }

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
        message: 'Order created successfully. Proceed to payment.',
        data: result,
      };
    } catch (error) {
      this.logger.error(
        `❌ Order creation failed: ${error.message}`,
        error.stack,
      );

      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      )
        throw error;

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
  async markOrderAsPaid(
    orderId: string,
    paymentReference: string,
    amount: number,
    ip: string,
    userAgent: string,
  ) {
    // 1️⃣ Fetch the order
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: ['user'], // Ensure user relation is loaded for audit/cache
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    // 2️⃣ Validate amount (Paystack/Flutterwave amount comes in kobo)
    if (order.total * 100 !== amount) {
      throw new BadRequestException(
        `Amount mismatch for order ${orderId}. Expected ${order.total * 100} but got ${amount}`,
      );
    }

    // 3️⃣ Mark order as paid
    order.paymentStatus = 'paid';
    order.status = 'processing'; // You may adjust based on workflow
    order.paymentReference = paymentReference;

    const savedOrder = await this.orderRepo.save(order);

    // 4️⃣ Update caches
    await this.redisCache.deleteCache(`order:${orderId}`);
    if (order.user?.id) {
      await this.redisCache.deleteByPrefix(`user_orders:${order.user.id}`);
    }

    // 5️⃣ Audit trail
    await this.auditService.enqueueLog({
      action: 'PAYMENT_CONFIRMED',
      userId: order.user?.id,
      ip,
      userAgent,
      metadata: { orderId, paymentReference, amount },
    });

    return savedOrder;
  }

  async getOrderEntity(orderId: string) {
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: ['user', 'items', 'shippingAddress'],
    });
    if (!order) return null; // PaymentService will handle NotFound
    return order;
  }
}
