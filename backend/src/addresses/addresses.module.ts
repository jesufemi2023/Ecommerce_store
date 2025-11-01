import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Address } from './entities/address.entity';
import { AddressService } from './addresses.service';
import { AddressController } from './addresses.controller';
import { AuditModule } from '../audit/audit.module'; // for auditService.enqueueLog()
import { UsersModule } from '../users/users.module'; // to access user relations if needed

@Module({
  imports: [
    TypeOrmModule.forFeature([Address]), // Registers Address repository
    AuditModule, // Enables audit logging through AuditService
    UsersModule, // Gives access to User entity & relationships
  ],
  controllers: [AddressController],
  providers: [AddressService],
  exports: [AddressService], // In case other modules (like Orders) need address data
})
export class AddressModule {}
