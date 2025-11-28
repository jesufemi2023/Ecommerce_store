// src/payment/payment.controller.ts
import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Headers,
  HttpException,
} from '@nestjs/common';
import { PaymentService } from './payment.service';
import { OrdersService } from '../orders/orders.service';
import * as crypto from 'crypto';

@Controller('payment')
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly ordersService: OrdersService,
  ) {}

  /**
   * 1️⃣ Initialize payment
   * Frontend sends only orderId
   */
  @Post('initialize')
  async initialize(@Body('orderId') orderId: string) {
    if (!orderId) throw new HttpException('orderId is required', 400);
    return this.paymentService.initializePayment(orderId);
  }

  /**
   * 2️⃣ Verify payment manually (optional)
   */
  @Get('verify')
  async verify(@Query('reference') reference: string) {
    if (!reference) throw new HttpException('reference is required', 400);
    return this.paymentService.verifyPayment(reference);
  }

  /**
   * 3️⃣ Paystack webhook
   */
  @Post('webhook')
  async webhook(
    @Headers('x-paystack-signature') signature: string,
    @Body() body: any,
    @Headers() headers: Record<string, string>,
  ) {
    const secret = process.env.PAYSTACK_SECRET_KEY ?? '';
    const hash = crypto.createHmac('sha512', secret).update(JSON.stringify(body)).digest('hex');
    if (hash !== signature) throw new HttpException('Invalid signature', 400);

    if (body.event === 'charge.success') {
      const data = body.data;
      const orderId = data.metadata?.orderId;
      const reference = data.reference;
      const amountPaid = data.amount;

      if (!orderId) throw new HttpException('orderId missing in metadata', 400);

      const ip = headers['x-forwarded-for'] || 'N/A';
      const userAgent = headers['user-agent'] || 'N/A';

      await this.ordersService.markOrderAsPaid(orderId, reference, amountPaid, ip, userAgent);

      return { status: 'success', orderId, reference };
    }

    return { status: 'ignored', event: body.event };
  }
}
