// src/payment/dto/payment.dto.ts
export interface InitializePaymentDto {
  email: string;
  amount: number; // in Naira
  metadata?: Record<string, any>;
}

export interface VerifyPaymentDto {
  reference: string;
}

export interface MarkOrderPaidDto {
  paymentReference: string;
  amount: number; // in kobo
}

export interface PaystackTransactionData {
  status: boolean;
  message: string;
  data: any;
}
