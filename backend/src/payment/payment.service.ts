// src/payment/payment.service.ts
import { Injectable, HttpException, NotFoundException } from '@nestjs/common';
import axios from 'axios';
import { OrdersService } from '../orders/orders.service';
import { PaystackTransactionData } from './dto/payment.dto';

@Injectable()
export class PaymentService {
  private readonly secretKey: string;
  private readonly baseUrl: string;

  constructor(private readonly ordersService: OrdersService) {
    if (!process.env.PAYSTACK_SECRET_KEY || !process.env.PAYSTACK_BASE_URL) {
      throw new Error('PAYSTACK_SECRET_KEY or PAYSTACK_BASE_URL not set');
    }
    this.secretKey = process.env.PAYSTACK_SECRET_KEY;
    this.baseUrl = process.env.PAYSTACK_BASE_URL;
  }

  // Retry helper for API calls
  private async retry<T>(
    fn: () => Promise<T>,
    retries = 3,
    delayMs = 1000,
  ): Promise<T> {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (err) {
        if (i < retries - 1) {
          await new Promise((res) => setTimeout(res, delayMs));
        } else {
          throw err;
        }
      }
    }
    throw new Error('Retry failed unexpectedly');
  }

  /**
   * Initialize payment using orderId only
   */
  async initializePayment(orderId: string): Promise<PaystackTransactionData> {
    const order = await this.ordersService.getOrderEntity(orderId);
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);

    const body = {
      email: order.user?.email,
      amount: order.total * 100, // in kobo
      metadata: { orderId },
    };

    return this.retry(async () => {
      try {
        const response = await axios.post(
          `${this.baseUrl}/transaction/initialize`,
          body,
          {
            headers: {
              Authorization: `Bearer ${this.secretKey}`,
              'Content-Type': 'application/json',
            },
          },
        );
        return response.data;
      } catch (error) {
        throw new HttpException(
          error.response?.data || 'Payment initialization failed',
          error.response?.status || 500,
        );
      }
    });
  }

  /**
   * Verify payment manually
   */
  async verifyPayment(reference: string): Promise<PaystackTransactionData> {
    return this.retry(async () => {
      try {
        const response = await axios.get(
          `${this.baseUrl}/transaction/verify/${reference}`,
          {
            headers: { Authorization: `Bearer ${this.secretKey}` },
          },
        );
        return response.data;
      } catch (error) {
        throw new HttpException(
          error.response?.data || 'Payment verification failed',
          error.response?.status || 500,
        );
      }
    });
  }
}
