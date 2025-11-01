import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UserController } from './users.controller';
import { User } from './entities/user.entity';
import { PreRegistration } from './entities/pre-registration.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { Address } from '../addresses/entities/address.entity';
import { AuditModule } from '../audit/audit.module';
@Module({
  imports: [
    TypeOrmModule.forFeature([User,  PreRegistration, RefreshToken, Address]),
    AuditModule,
  ],
  providers: [UsersService],
  controllers: [UserController],
  exports: [UsersService], // so other modules can use UsersService
})
export class UsersModule {}
