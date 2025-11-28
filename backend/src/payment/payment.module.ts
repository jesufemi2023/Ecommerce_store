// src/payment/payment.module.ts
import { Module } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { OrdersModule } from 'src/orders/orders.module';

@Module({
  imports: [OrdersModule], // ✅ Import OrdersModule here
  providers: [PaymentService],
  controllers: [PaymentController],
})
export class PaymentModule {}
