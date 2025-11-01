import {
  Injectable,
  ConflictException,
  InternalServerErrorException,
  ForbiddenException,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './entities/user.entity';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { plainToInstance } from 'class-transformer';
import { UserResponseDto } from './dto/user-response.dto';

interface CreateUserInput {
  email: string;
  password_hash: string; // already hashed
  full_name: string;
  is_email_verified?: boolean; // optional
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly auditService: AuditService,
  ) {}

  // -------------------------
  // Find user by email
  // -------------------------
  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  // -------------------------
  // Find user by ID
  // -------------------------
  async findById(id: string): Promise<UserResponseDto> {
    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Convert to a safe response DTO
    return plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: true,
    });
  }
  // -------------------------
  // Create a new user
  // -------------------------
  async createUser(data: CreateUserInput): Promise<User> {
    const existing = await this.findByEmail(data.email);
    if (existing) throw new ConflictException('Email already exists');

    const user = this.userRepository.create({
      email: data.email,
      password_hash: data.password_hash,
      full_name: data.full_name,
      is_email_verified: data.is_email_verified ?? false, // ✅ default false unless specified
    });

    try {
      return await this.userRepository.save(user);
    } catch (err) {
      this.logger.error('Error creating user', err.stack);
      throw new InternalServerErrorException('Failed to create user');
    }
  }

  // -------------------------
  // Validate credentials (helper)
  // -------------------------
  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.findByEmail(email);
    if (!user) return null;

    const isValid = await bcrypt.compare(password, user.password_hash);
    return isValid ? user : null;
  }

  // Update password for forgot password (expecting already-hashed password)
  async updatePassword(userId: string, newPasswordHash: string): Promise<void> {
    try {
      await this.userRepository.update(
        { id: userId },
        { password_hash: newPasswordHash },
      );
    } catch (err) {
      this.logger.error('Error updating user password', err.stack || err);
      throw new InternalServerErrorException('Failed to update password');
    }
  }

  async updateUser(
    userId: string,
    updateUserDto: UpdateUserDto,
    ip?: string,
    userAgent?: string,
  ): Promise<UserResponseDto> {
    // return DTO now
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const changedFields: string[] = [];

    // Update fields (same as before)
    if (updateUserDto.full_name && updateUserDto.full_name !== user.full_name) {
      user.full_name = updateUserDto.full_name;
      changedFields.push('full_name');
    }
    if (updateUserDto.phone && updateUserDto.phone !== user.phone) {
      user.phone = updateUserDto.phone;
      changedFields.push('phone');
    }
    if (
      updateUserDto.avatar_url &&
      updateUserDto.avatar_url !== user.avatar_url
    ) {
      user.avatar_url = updateUserDto.avatar_url;
      changedFields.push('avatar_url');
    }
    if (updateUserDto.email && updateUserDto.email !== user.email) {
      user.email = updateUserDto.email;
      user.is_email_verified = false;
      changedFields.push('email');
    }
    if (updateUserDto.new_password) {
      if (!updateUserDto.old_password)
        throw new BadRequestException('Old password is required');
      const isMatch = await bcrypt.compare(
        updateUserDto.old_password,
        user.password_hash,
      );
      if (!isMatch) throw new BadRequestException('Old password is incorrect');
      user.password_hash = await bcrypt.hash(updateUserDto.new_password, 10);
      changedFields.push('password');
    }

    // Save changes
    await this.userRepository.save(user);

    // Enqueue audit log
    if (changedFields.length > 0) {
      await this.auditService.enqueueLog({
        action: AuditAction.UPDATE_PROFILE,
        userId: user.id,
        ip,
        userAgent,
        metadata: { changedFields },
      });
    }

    // Transform entity to DTO (excludes password automatically)
    return plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: true,
    });
  }

  // DELETE user account (soft delete)
  // -----------------------------
  async deleteUser(
    userId: string,
    ip: string,
    userAgent: string,
  ): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) throw new NotFoundException('User not found');
    if (user.role === 'ADMIN') {
      throw new ForbiddenException('Admins cannot delete their account');
    }

    // Perform soft delete
    await this.userRepository.softDelete(userId);

    // Log the action asynchronously
    await this.auditService.enqueueLog({
      action: AuditAction.USER_DELETED,
      userId,
      ip,
      userAgent,
      metadata: { email: user.email },
    });
  }
}
