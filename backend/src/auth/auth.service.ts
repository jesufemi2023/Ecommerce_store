//src/auth/auth.service.ts

import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { PreRegistration } from '../users/entities/pre-registration.entity';
import { RefreshToken } from '../users/entities/refresh-token.entity';
import { PasswordResetToken } from '../users/entities/password-reset-token.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { RegisterDto } from './dto/register.dto';
import * as bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { jwtConstants } from './jwt.constants';
import { MailerService } from '../mailer/mailer.service'; // Mailer integration
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { VerifiedUserDto } from './dto/verified-user.dto';

import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    @InjectRepository(PreRegistration)
    private readonly preRegRepo: Repository<PreRegistration>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    @InjectRepository(PasswordResetToken)
    private readonly passwordResetRepo: Repository<PasswordResetToken>,
    private readonly jwtService: JwtService,
    private readonly mailerService: MailerService,
    private readonly auditService: AuditService,
  ) {}

  // -------------------------
  // 1️⃣ Register (Pre-Registration with Email Verification)
  // -------------------------
  async register(dto: RegisterDto, ip: string, user_agent: string) {
    // Step 1: Check if user already exists in main users table
    const existingUser = await this.usersService.findByEmail(
      dto.email.toLowerCase(),
    );
    if (existingUser) throw new ConflictException('Email already in use');

    // Step 2: Prepare new token + password hash
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiry

    // Step 3: Check if email already exists in pre_registrations
    let preReg = await this.preRegRepo.findOne({
      where: { email: dto.email.toLowerCase() },
    });

    if (preReg) {
      // ✅ Update existing record with new token, expiry, and password hash
      preReg.password_hash = passwordHash;
      preReg.full_name = dto.full_name ?? '';
      preReg.verification_token_hash = tokenHash;
      preReg.expires_at = expiresAt;
      preReg.ip = ip;
      preReg.user_agent = user_agent;

      await this.preRegRepo.save(preReg);

      // Resend verification email
      try {
        await this.mailerService.sendVerificationEmail(dto.email, token);
      } catch (err) {
        this.logger.error(
          'Failed to send verification email (resend)',
          err.stack || err,
        );
        // Surface friendly message, not raw error
        throw new InternalServerErrorException(
          'Failed to send verification email. Please try again later.',
        );
      }

      return { message: 'Verification email resent. Please check your inbox.' };
    }

    // Step 4: Otherwise, create new pre-registration
    preReg = this.preRegRepo.create({
      email: dto.email.toLowerCase(),
      password_hash: passwordHash,
      full_name: dto.full_name,
      verification_token_hash: tokenHash,
      expires_at: expiresAt,
      ip,
      user_agent,
    });

    await this.preRegRepo.save(preReg);

    // Send initial verification email
    try {
      await this.mailerService.sendVerificationEmail(dto.email, token);
    } catch (err) {
      this.logger.error(
        `Failed to send verification email ${dto.email}: ${err.message}`,
        err.stack || err,
      );

      await this.auditService.enqueueLog({
        action: AuditAction.EMAIL_SEND_FAILED,
        ip,
        userAgent: user_agent,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        metadata: { reason: err.message, email: dto.email },
      });

      throw new InternalServerErrorException(
        'Failed to send verification email. Please try again later.',
      );
    }

    await this.auditService.enqueueLog({
      action: AuditAction.REGISTER_REQUEST,
      ip,
      userAgent: user_agent,
      metadata: { email: dto.email },
    });

    return { message: 'Verification email sent' };
  }

  // -------------------------
  // 2️⃣ Verify Email & Create User
  // -------------------------
  // -------------------------
  async verifyEmail(token: string) {
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const preReg = await this.preRegRepo.findOne({
      where: { verification_token_hash: tokenHash },
    });
    if (!preReg) throw new ConflictException('Invalid or expired token');

    if (preReg.expires_at < new Date())
      throw new ConflictException('Token expired');

    // ✅ Create user
    const user = await this.usersService.createUser({
      email: preReg.email,
      password_hash: preReg.password_hash,
      full_name: preReg.full_name,
      is_email_verified: true,
    });

    // ✅ Clean up used pre-registration
    await this.preRegRepo.delete(preReg.id);

    // ✅ Log audit event
    await this.auditService.enqueueLog({
      action: AuditAction.EMAIL_VERIFIED,
      userId: user.id,
      ip: preReg.ip,
      userAgent: preReg.user_agent,
    });

    // ✅ No sensitive data in response
    return { success: true, message: 'Email successfully verified' };
  }
  // -------------------------
  // 3️⃣ Login with JWT & Refresh Token
  // -------------------------
  async login(
    email: string,
    password: string,
    device_id: string,
    ip: string,
    user_agent: string,
  ) {
    const user = await this.usersService.findByEmail(email.toLowerCase());
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (!user.is_email_verified)
      throw new UnauthorizedException('Email not verified');

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      await this.auditService.enqueueLog({
        action: AuditAction.LOGIN_FAILED,
        ip,
        userAgent: user_agent,
        metadata: { email },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.auditService.enqueueLog({
      action: AuditAction.LOGIN_SUCCESS,
      userId: user.id,
      ip,
      userAgent: user_agent,
    });

    return this.generateTokens(user.id, user.role, device_id, ip, user_agent);
  }

  // -------------------------
  // 4️⃣ Refresh Tokens (Rotation)
  // -------------------------
  async refreshTokens(refreshTokenPlain: string, device_id: string) {
    const refreshTokenHash = createHash('sha256')
      .update(refreshTokenPlain)
      .digest('hex');

    const storedToken = await this.refreshTokenRepo.findOne({
      where: { token_hash: refreshTokenHash, device_id, is_revoked: false },
      relations: ['user'],
    });

    if (!storedToken)
      throw new UnauthorizedException('Invalid or revoked refresh token');
    if (storedToken.expires_at < new Date())
      throw new UnauthorizedException('Refresh token expired');

    // Prevent too frequent refreshes (optional safety)
    const now = new Date();
    if (
      storedToken.last_seen_at &&
      now.getTime() - storedToken.last_seen_at.getTime() < 10 * 1000
    )
      throw new BadRequestException('Refresh requested too soon');

    // Revoke old token atomically
    storedToken.is_revoked = true;
    storedToken.last_seen_at = now;
    await this.refreshTokenRepo.save(storedToken);

    // Log the refresh action
    await this.auditService.enqueueLog({
      action: AuditAction.REFRESH,
      userId: storedToken.user.id,
      ip: storedToken.ip,
      userAgent: storedToken.user_agent,
      metadata: { token_id: storedToken.id, refreshed_at: now },
    });

    // Generate new access + refresh tokens
    const newTokens = await this.generateTokens(
      storedToken.user.id,
      storedToken.user.role,
      device_id,
      storedToken.ip,
      storedToken.user_agent,
    );

    return {
      success: true,
      message: 'Tokens refreshed successfully',
      ...newTokens,
    };
  }
  // -------------------------
  // 5️⃣ Logout (Single Device)
  // -------------------------
  async logout(refreshTokenPlain: string) {
    const refreshTokenHash = createHash('sha256')
      .update(refreshTokenPlain)
      .digest('hex');

    const token = await this.refreshTokenRepo.findOne({
      where: { token_hash: refreshTokenHash },
    });
    if (!token) throw new NotFoundException('Refresh token not found');

    token.is_revoked = true;
    await this.refreshTokenRepo.save(token);
    await this.auditService.enqueueLog({
      action: AuditAction.LOGOUT,
      userId: token.id,
      ip: token.ip,
      userAgent: token.user_agent,
    });

    return { message: 'Logged out successfully' };
  }

  // -------------------------
  // 6️⃣ Logout All Devices
  // -------------------------
  async logoutAll(userId: string) {
    await this.refreshTokenRepo.update(
      { user: { id: userId } },
      { is_revoked: true },
    );

    await this.auditService.enqueueLog({
      action: AuditAction.TOKEN_REVOKED,
      userId,
      metadata: { reason: 'Logout all sessions' },
    });

    return { message: 'All sessions revoked' };
  }

  // -------------------------
  // Password Reset: Request a password reset email (no enumeration)
  // -------------------------
  async requestPasswordReset(email: string) {
    const normalized = email.toLowerCase();
    const user = await this.usersService.findByEmail(normalized);

    const frontendMessage =
      'If an account with that email exists, a password reset link was sent. Please check your email.';

    if (!user) {
      this.logger.debug(
        `Password reset requested for non-existing email: ${normalized}`,
      );
      return { message: frontendMessage };
    }

    if (!user.is_email_verified) {
      // do not reveal to the user; optionally resend verification instead
      this.logger.debug(
        `Password reset requested for unverified email: ${normalized}`,
      );
      return { message: frontendMessage };
    }

    // Invalidate previous tokens for this user (single active token policy)
    try {
      await this.passwordResetRepo.update(
        { user: { id: user.id } },
        { used: true },
      );
    } catch (err) {
      this.logger.warn(
        'Failed to invalidate previous reset tokens',
        err.stack || err,
      );
    }

    // Generate token and hashed token
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    const prToken = this.passwordResetRepo.create({
      token_hash: tokenHash,
      user: user as any,
      user_id: user.id,
      expires_at: expiresAt,
      used: false,
    });

    try {
      await this.passwordResetRepo.save(prToken);
    } catch (err) {
      this.logger.error(
        'Failed to save password reset token',
        err.stack || err,
      );
      throw new InternalServerErrorException(
        'Failed to generate reset token. Please try again later.',
      );
    }

    // Send the reset email (do not expose sending errors to client)
    try {
      await this.mailerService.sendPasswordResetEmail(user.email, rawToken);
      this.logger.log(`Password reset email sent for user=${user.email}`);

      await this.auditService.enqueueLog({
        action: AuditAction.PASSWORD_RESET_REQUEST,
        userId: user?.id,
        ip: '',
        metadata: { email },
      });
    } catch (err) {
      this.logger.error(
        `Failed to send password reset email to ${user.email}`,
        err.stack || err,
      );
      // swallow error for security/usability; frontend still gets friendly message
    }

    return { message: frontendMessage };
  }

  // -------------------------
  // Verify reset token (optional endpoint for frontend)
  // -------------------------
  async verifyResetToken(tokenPlain: string) {
    const tokenHash = createHash('sha256').update(tokenPlain).digest('hex');

    const stored = await this.passwordResetRepo.findOne({
      where: { token_hash: tokenHash },
      relations: ['user'],
    });

    if (!stored || stored.used) {
      this.logger.debug('Invalid or used password reset token attempt');
      throw new UnauthorizedException(
        'This reset link is invalid or has already been used.',
      );
    }

    if (stored.expires_at < new Date()) {
      this.logger.debug('Expired password reset token attempt');
      throw new UnauthorizedException(
        'This reset link has expired. Please request a new one.',
      );
    }

    // return minimal info to frontend (avoid leaking sensitive data)
    return { valid: true, email: stored.user.email };
  }

  // -------------------------
  // Reset password using token
  // -------------------------
  async resetPassword(tokenPlain: string, newPassword: string) {
    const tokenHash = createHash('sha256').update(tokenPlain).digest('hex');

    const stored = await this.passwordResetRepo.findOne({
      where: { token_hash: tokenHash },
      relations: ['user'],
    });

    if (!stored || stored.used) {
      this.logger.warn('Attempt to use invalid or used password reset token');
      throw new UnauthorizedException(
        'This reset link is invalid or has already been used.',
      );
    }

    if (stored.expires_at < new Date()) {
      this.logger.warn('Attempt to use expired password reset token');
      throw new UnauthorizedException(
        'This reset link has expired. Please request a new one.',
      );
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // Update password in users table
    try {
      await this.usersService.updatePassword(stored.user.id, newPasswordHash);
      this.logger.log(`Password updated for user=${stored.user.email}`);
    } catch (err) {
      this.logger.error('Error updating password', err.stack || err);
      throw new InternalServerErrorException(
        'Failed to reset password. Please try again later.',
      );
    }

    // Mark token used
    stored.used = true;
    try {
      await this.passwordResetRepo.save(stored);
    } catch (err) {
      this.logger.warn('Failed to mark reset token used', err.stack || err);
      // continue — token being marked used is recommended but not fatal here
    }

    // Revoke all refresh tokens for user (force re-login)
    try {
      await this.logoutAll(stored.user.id);
      this.logger.log(
        `All refresh tokens revoked for user=${stored.user.email} after password reset`,
      );
    } catch (err) {
      this.logger.warn(
        'Failed to revoke refresh tokens after password reset',
        err.stack || err,
      );
    }

    // Optionally, send a confirmation email for password change (not necessary)
    // try { await this.mailerService.sendPasswordChangeNotice(stored.user.email); } catch (err) { ... }

    await this.auditService.enqueueLog({
      action: AuditAction.PASSWORD_RESET_COMPLETED,
      userId: stored.user.id,
      ip: '',
    });

    return {
      message:
        'Your password has been reset successfully. Please log in with your new password.',
    };
  }

  // -------------------------
  // 7️⃣ Helper: Generate Access + Refresh Tokens
  // -------------------------
  private async generateTokens(
    userId: string,
    role: string,
    device_id: string,
    ip: string,
    user_agent: string,
  ) {
    // Access token
    const payload = { sub: userId, roles: [role], device_id };
    const accessToken = this.jwtService.sign(payload, {
      secret: jwtConstants.accessSecret,
      expiresIn: jwtConstants.accessExpiresIn,
    });

    // Refresh token
    const refreshTokenPlain = randomBytes(64).toString('hex');
    const refreshTokenHash = createHash('sha256')
      .update(refreshTokenPlain)
      .digest('hex');

    const refreshToken = this.refreshTokenRepo.create({
      user: { id: userId } as any,
      token_hash: refreshTokenHash,
      device_id,
      ip,
      user_agent,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });
    await this.refreshTokenRepo.save(refreshToken);

    return { accessToken, refreshToken: refreshTokenPlain, expiresIn: 900 };
  }
}
