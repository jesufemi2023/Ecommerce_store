/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */
// src/common/filters/http-exception.filter.ts
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'An unexpected error occurred';

    // Handle known HttpExceptions (e.g., BadRequest, Unauthorized)
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      message =
        typeof res === 'string'
          ? res
          : (res as Record<string, any>).message || message;
    } else if (exception instanceof Error) {
      // Non-HTTP errors (e.g., DB errors, runtime crashes)
      message = exception.message || message;
    }

    // 📝 Log full details for auditing & debugging
    this.logger.error(
      `❌ [${request.method}] ${request.url} | Status: ${status} | IP: ${request.ip}`,
      JSON.stringify({
        message,
        requestId: request.headers['x-request-id'] || null,
        userAgent: request.headers['user-agent'],
        body: this.sanitizeRequestBody(request.body),
        stack: exception instanceof Error ? exception.stack : null,
      }),
    );

    // 🔒 Response: keep it friendly, never leak stack trace
    response.status(status).json({
      statusCode: status,
      success: false,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: this.getFriendlyMessage(message, status),
    });
  }

  private sanitizeRequestBody(body: any) {
    if (!body) return {};
    const clone = { ...body };
    if (clone.password) clone.password = '********';
    if (clone.token) clone.token = '********';
    if (clone.refreshToken) clone.refreshToken = '********';
    return clone;
  }

  private getFriendlyMessage(message: string, status: number): string {
    // Map technical messages to user-friendly messages
    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      return 'Something went wrong on our side. Please try again later.';
    }
    if (typeof message === 'string') return message;
    return 'Request could not be processed.';
  }
}
