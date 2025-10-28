import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './entities/user.entity';
import { PreRegistration } from './entities/pre-registration.entity';
import { RefreshToken } from './entities/refresh-token.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, PreRegistration, RefreshToken])],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService], // so other modules can use UsersService
})
export class UsersModule {}
