import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { PreRegistration } from '../users/entities/pre-registration.entity';
import { RefreshToken } from '../users/entities/refresh-token.entity';
import { jwtConstants } from './jwt.constants';
import { JwtStrategy } from './jwt.strategy';
import { MailerModule } from '../mailer/mailer.module'; // ← import MailerModule
import { PasswordResetToken } from '../users/entities/password-reset-token.entity';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    TypeOrmModule.forFeature([
      PreRegistration,
      RefreshToken,
      PasswordResetToken,
    ]),
    JwtModule.register({
      secret: jwtConstants.accessSecret,
      signOptions: { expiresIn: jwtConstants.accessExpiresIn },
    }),
    MailerModule, // ← make MailerService available to AuthService
    AuditModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
