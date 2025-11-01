/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// backend/src/users/user.controller.ts

import {
  Controller,
  Patch,
  Get,
  Delete,
  HttpCode,
  HttpStatus,
  Body,
  UseGuards,
  Req,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UserController {
  private readonly logger = new Logger(UserController.name);

  constructor(private readonly userService: UsersService) {}

  // Update logged-in user profile
  @Patch('me')
  @UseGuards(JwtAuthGuard)
  async updateProfile(@Req() req, @Body() updateUserDto: UpdateUserDto) {
    const userId = req.user.id;
    const ip = req.ip;
    const userAgent = req.headers['user-agent'] || 'unknown';

    return this.userService.updateUser(userId, updateUserDto, ip, userAgent);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Req() req) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const userId = req.user.id;
    const profile = await this.userService.findById(userId);
    return profile; // transformed to UserResponseDto inside service
  }

  // DELETE /users/me  — Delete own account
  @Delete('me')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK) // ✅ use 200 so you can return a message
  async deleteAccount(@Req() req) {
    const userId = req.user.id;
    const ip = req.ip;
    const userAgent = req.headers['user-agent'] || 'unknown';

    this.logger.debug(`User ${userId} requested account deletion`);

    await this.userService.deleteUser(userId, ip, userAgent);

    // ✅ Explicit message for frontend and ResponseInterceptor
    return {
      message: 'Account deleted successfully',
      userId,
      timestamp: new Date().toISOString(),
    };
  }
}
