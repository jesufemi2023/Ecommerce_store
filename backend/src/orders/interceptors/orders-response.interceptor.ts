import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class OrdersResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        // Check if the response already has { success, message, data } format
        if (data && data.success !== undefined && data.message) {
          return data; // already formatted by service
        }

        // Otherwise, wrap it in your standard structure
        return {
          success: true,
          message: 'Request processed successfully.',
          data,
        };
      }),
    );
  }
}
