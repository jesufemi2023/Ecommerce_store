/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable prettier/prettier */
import {
  Controller,
  Post,
  Body,
  Query,
  Req,
  UseGuards,
  Get,
  Res,
  HttpCode,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { LogoutDto } from './dto/logout.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { Request } from 'express';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  constructor(private readonly authService: AuthService) {}

  // 1️⃣ Register
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60 } }) // 5 requests per 60 seconds
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    const ip = req.ip ?? '0.0.0.0';
    const userAgent = req.headers['user-agent'] ?? 'unknown';
    return this.authService.register(dto, ip, userAgent);
  }

  // 2️⃣ Verify Email
  // -------------------------
  // ✅ Verify Email Endpoint (GET)
  @Get('verify-email')
  @HttpCode(200)
  async verifyEmail(@Query('token') token: string, @Res() res: Response) {
    try {
      await this.authService.verifyEmail(token);

      // ✅ Redirect user to frontend after success
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      return res.redirect(`${frontendUrl}/email-verified?status=success`);
    } catch (error) {
      this.logger.error(`Email verification failed: ${error.message}`);

      // ✅ Redirect to failure page
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      return res.redirect(`${frontendUrl}/email-verified?status=failed`);
    }
   }

  // 3️⃣ Login
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60 } }) // 5 requests per 60 seconds
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const ip = req.ip ?? '0.0.0.0';
    const userAgent = req.headers['user-agent'] ?? 'unknown';
    return this.authService.login(
      dto.email,
      dto.password,
      dto.device_id,
      ip,
      userAgent,
    );
  }

  // 4️⃣ Refresh
  @Post('refresh')
  async refresh(@Body() dto: RefreshDto) {
    return this.authService.refreshTokens(dto.refreshToken, dto.device_id);
  }

  // 5️⃣ Logout
  @Post('logout')
  async logout(@Body() dto: LogoutDto) {
    return this.authService.logout(dto.refreshToken);
  }

  // 6️⃣ Logout All
  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  async logoutAll(@Req() req: any) {
    return this.authService.logoutAll(req.user.id); // ✅ fixed
  }

  // Request password reset
  @Post('request-password-reset')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60 } }) // 5 requests per 60 seconds
  async requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    return this.authService.requestPasswordReset(dto.email);
  }

  // Optional: Verify reset token (frontend can call before showing reset form)
@Get('verify-reset')
  @HttpCode(200)
  async verifyResetToken(@Query('token') token: string, @Res() res: Response) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    try {
      await this.authService.verifyResetToken(token);
      this.logger.log('Password reset token verified successfully');
      return res.redirect(`${frontendUrl}/reset-password?token=${token}&status=valid`);
    } catch (error) {
      this.logger.error(`Password reset token verification failed: ${error.message}`);
      return res.redirect(`${frontendUrl}/reset-password?status=invalid`);
    }
  }  // Use this to actually reset the password
  
  
 @Post('reset-password')
@HttpCode(200)
async resetPassword(@Body() dto: ResetPasswordDto) {
  try {
    // 1️⃣ Attempt password reset using the service
    await this.authService.resetPassword(dto.token, dto.new_password);

    // 2️⃣ Log for audit
    this.logger.log(`Password reset successful for token: ${dto.token}`);

    // 3️⃣ Return JSON for frontend to handle next step
    return {
      success: true,
      message: 'Password has been reset successfully.',
    };

  } catch (error) {
    // 4️⃣ Log for visibility and monitoring
    this.logger.error(`Password reset failed: ${error.message}`);

    // 5️⃣ Return friendly structured error to frontend
    throw new BadRequestException({
      success: false,
      message: error.message || 'Password reset failed. Please try again.',
    });
  }
}

}
