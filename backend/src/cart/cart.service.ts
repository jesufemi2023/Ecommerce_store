import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cart, CartStatus } from './entities/cart.entity';
import { CartItem } from './entities/cart-item.entity';
import { AddToCartDto, RemoveCartItemDto } from './dto/cart.dto';
import { ProductVariant } from 'src/product/entities/product-variant.entity';
import { User } from 'src/users/entities/user.entity';
import { RedisCacheService } from 'src/common/cache/redis-cache.service';
import { AuditService } from 'src/audit/audit.service';
import { AuditAction } from 'src/audit/enums/audit-action.enum';

@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);

  constructor(
    @InjectRepository(Cart)
    private readonly cartRepo: Repository<Cart>,

    @InjectRepository(CartItem)
    private readonly cartItemRepo: Repository<CartItem>,

    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,

    private readonly cacheService: RedisCacheService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * 🔢 Recalculate totals for a cart
   */
  private recalcCart(cart: Cart) {
    cart.totalItems = cart.items.reduce((sum, i) => sum + i.quantity, 0);
    cart.totalAmount = cart.items.reduce(
      (sum, i) => sum + Number(i.totalPrice),
      0,
    );
  }

  /**
   * 🛒 Add a product variant to the user's active cart.
   * - If the variant already exists, increase its quantity.
   * - Otherwise, create a new cart item.
   */
  async addToCart(
    user: User,
    dto: AddToCartDto,
    ip?: string,
    userAgent?: string,
  ): Promise<Cart> {
    const cacheKey = `cart:user:${user.id}`;
    this.logger.log(
      `Adding variant ${dto.variantId} (x${dto.quantity}) to user ${user.id}'s cart`,
    );

    // 1️⃣ Fetch cart (cache first)
    let cart = await this.cacheService.getCache<Cart>(cacheKey);

    if (!cart) {
      cart = await this.cartRepo.findOne({
        where: { user: { id: user.id }, status: CartStatus.ACTIVE },
        relations: [
          'items',
          'items.variant',
          'items.variant.product',
          'items.variant.product.images',
        ],
      });

      if (!cart) {
        cart = this.cartRepo.create({ user, items: [] });
        await this.cartRepo.save(cart);
        this.logger.log(`🛍️ Created new active cart for user ${user.id}`);
      }
    }

    // 2️⃣ Validate variant
    const variant = await this.variantRepo.findOne({
      where: { id: dto.variantId },
      relations: ['product', 'product.images'],
    });
    if (!variant) throw new NotFoundException('Product variant not found');

    // 3️⃣ Check if variant already exists in cart
    let existingItem = cart.items.find(
      (item) => item.variant?.id === variant.id,
    );

    if (existingItem) {
      // Update quantity and total
      existingItem.quantity += dto.quantity;
      existingItem.totalPrice =
        Number(existingItem.unitPrice) * existingItem.quantity;
      await this.cartItemRepo.save(existingItem);
      this.logger.log(
        `Updated quantity of variant ${variant.id} to ${existingItem.quantity}`,
      );
    } else {
      // Create new cart item
      const product = variant.product;
      const productImage = product.images?.[0]?.imageUrl ?? null;

      existingItem = this.cartItemRepo.create({
        cart,
        variant,
        quantity: dto.quantity,
        unitPrice: Number(variant.price) || 0,
        totalPrice: (Number(variant.price) || 0) * dto.quantity,
        productName: product.name || 'Unknown Product',
        productImage,
        variantLabel:
          variant.name ?? `${variant.color ?? ''} ${variant.size ?? ''}`.trim(),
      });

      await this.cartItemRepo.save(existingItem);
      cart.items.push(existingItem);

      this.logger.log(`Added new variant ${variant.id} to cart ${cart.id}`);
    }

    // 4️⃣ Recalculate totals
    this.recalcCart(cart);
    await this.cartRepo.save(cart);

    // 5️⃣ Refresh cache
    await this.cacheService.deleteCache(cacheKey);
    await this.cacheService.setCache(cacheKey, cart, 300);

    // 6️⃣ Audit
    await this.auditService.enqueueLog({
      action: AuditAction.CART_ADD_ITEM,
      userId: user.id,
      ip,
      userAgent,
      metadata: {
        variantId: dto.variantId,
        quantity: dto.quantity,
        totalAmount: cart.totalAmount,
      },
    });

    return cart;
  }

  /**
   * ❌ Remove one or more cart items by their IDs.
   * Keeps empty carts ACTIVE and recalculates totals.
   */
  async removeItemsFromCart(
    user: User,
    dto: RemoveCartItemDto,
    ip?: string,
    userAgent?: string,
  ): Promise<Cart> {
    const cacheKey = `cart:user:${user.id}`;
    this.logger.log(
      `Removing ${dto.cartItemId.length} item(s) from user ${user.id}'s cart`,
    );

    const cart = await this.cartRepo.findOne({
      where: { user: { id: user.id }, status: CartStatus.ACTIVE },
      relations: ['items', 'items.variant', 'items.variant.product'],
    });

    if (!cart) throw new NotFoundException('Active cart not found');

    // 1️⃣ Ensure valid items exist
    const itemsToRemove = cart.items.filter((i) =>
      dto.cartItemId.includes(i.id),
    );
    if (itemsToRemove.length === 0)
      throw new BadRequestException('No valid cart items found to remove');

    // 2️⃣ Delete items directly via repository
    await this.cartItemRepo.delete(dto.cartItemId);

    // 3️⃣ Reload the updated cart
    const updatedCart = await this.cartRepo.findOne({
      where: { id: cart.id },
      relations: ['items', 'items.variant', 'items.variant.product'],
    });

    if (!updatedCart)
      throw new NotFoundException('Cart not found after removal');

    // 4️⃣ Recalculate totals
    this.recalcCart(updatedCart);
    await this.cartRepo.save(updatedCart);

    // 5️⃣ Update cache
    await this.cacheService.deleteCache(cacheKey);
    await this.cacheService.setCache(cacheKey, updatedCart, 300);

    // 6️⃣ Audit log
    await this.auditService.enqueueLog({
      action: AuditAction.CART_REMOVE_ITEM,
      userId: user.id,
      ip,
      userAgent,
      metadata: {
        removedItemIds: dto.cartItemId,
        remainingItems: updatedCart.totalItems,
        totalAmount: updatedCart.totalAmount,
      },
    });

    this.logger.log(
      `Removed ${itemsToRemove.length} item(s) from cart ${cart.id}`,
    );

    return updatedCart;
  }

  /**
   * 🧾 Fetch user's active cart (from cache or DB)
   */
  async getCartByUser(user: User): Promise<Cart> {
    const cacheKey = `cart:user:${user.id}`;

    // 1️⃣ Try cache first
    const cachedCart = await this.cacheService.getCache<Cart>(cacheKey);
    if (cachedCart) {
      this.logger.debug(`✅ Cache HIT for cart of user ${user.id}`);
      return cachedCart;
    }

    // 2️⃣ Fetch from DB
    const cart = await this.cartRepo.findOne({
      where: { user: { id: user.id }, status: CartStatus.ACTIVE },
      relations: ['items', 'items.variant', 'items.variant.product'],
    });

    if (!cart) throw new NotFoundException('Cart not found');

    // 3️⃣ Cache result
    await this.cacheService.setCache(cacheKey, cart, 300);
    this.logger.debug(`🟢 Cache SET for cart of user ${user.id}`);

    return cart;
  }

  /**
   * 🧹 Clear all items from the user's active cart.
   * Keeps the cart ACTIVE but empty, resets totals, logs audit, and clears cache.
   */
  async clearCart(user: User, ip?: string, userAgent?: string): Promise<Cart> {
    const cacheKey = `cart:user:${user.id}`;
    this.logger.log(`🧹 Clearing all items from user ${user.id}'s cart`);

    // 1️⃣ Find the user's active cart
    const cart = await this.cartRepo.findOne({
      where: { user: { id: user.id }, status: CartStatus.ACTIVE },
      relations: ['items'],
    });

    if (!cart) throw new NotFoundException('Active cart not found');

    // 2️⃣ Remove all items (if any)
    if (cart.items.length > 0) {
      await this.cartItemRepo.remove(cart.items);
      cart.items = [];
    }

    // 3️⃣ Reset totals
    cart.totalItems = 0;
    cart.totalAmount = 0;
    await this.cartRepo.save(cart);

    // 4️⃣ Clear and refresh cache
    await this.cacheService.deleteCache(cacheKey);
    await this.cacheService.setCache(cacheKey, cart, 300);

    // 5️⃣ Audit log
    await this.auditService.enqueueLog({
      action: AuditAction.CART_CLEAR,
      userId: user.id,
      ip,
      userAgent,
      metadata: {
        message: 'All items cleared from cart',
        totalAmount: 0,
      },
    });

    this.logger.log(`✅ Cart ${cart.id} cleared for user ${user.id}`);
    return cart;
  }
}
