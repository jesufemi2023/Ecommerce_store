/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Injectable,
  ConflictException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './entities/user.entity';

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
  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
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

    // Update password (expecting already-hashed password)
  async updatePassword(userId: string, newPasswordHash: string): Promise<void> {
    try {
      await this.userRepository.update({ id: userId }, { password_hash: newPasswordHash });
    } catch (err) {
      this.logger.error('Error updating user password', err.stack || err);
      throw new InternalServerErrorException('Failed to update password');
    }
  }

}


