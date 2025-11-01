import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Address } from './entities/address.entity';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { AddressResponseDto } from './dto/address-response.dto';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class AddressService {
  private readonly logger = new Logger(AddressService.name);

  constructor(
    @InjectRepository(Address)
    private readonly addressRepository: Repository<Address>,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Create a new address for the authenticated user.
   */
  async createAddress(
    userId: string,
    dto: CreateAddressDto,
    ip: string,
    userAgent: string,
  ): Promise<AddressResponseDto> {
    const address = this.addressRepository.create({
      ...dto,
      user: { id: userId },
    });

    const saved = await this.addressRepository.save(address);

    // Enqueue audit log asynchronously (non-blocking)
    await this.auditService.enqueueLog({
      action: AuditAction.ADDRESS_CREATED,
      userId,
      ip,
      userAgent,
      metadata: { addressId: saved.id, city: saved.city },
    });

    this.logger.log(`Address created for user ${userId} (${saved.id})`);
    return plainToInstance(AddressResponseDto, saved, {
      excludeExtraneousValues: true,
    });
  }

  /** Get all addresses for the current user */
  async findAllByUser(userId: string): Promise<AddressResponseDto[]> {
    const addresses = await this.addressRepository.find({
      where: { user: { id: userId } },
      order: { created_at: 'DESC' },
    });

    return plainToInstance(AddressResponseDto, addresses, {
      excludeExtraneousValues: true,
    });
  }
  /**
   * Retrieve a specific address by ID.
   */
  async findOneByUser(userId: string, addressId: string): Promise<Address> {
    const address = await this.addressRepository.findOne({
      where: { id: addressId, user: { id: userId } },
    });

    if (!address) {
      throw new NotFoundException('Address not found');
    }
    return address;
  }

  /**
   * Update a user’s address.
   */
  async updateAddress(
    userId: string,
    addressId: string,
    dto: UpdateAddressDto,
    ip: string,
    userAgent: string,
  ): Promise<AddressResponseDto> {
    const address = await this.findOneByUser(userId, addressId);

    Object.assign(address, dto);
    const updated = await this.addressRepository.save(address);

    await this.auditService.enqueueLog({
      action: AuditAction.ADDRESS_UPDATED,
      userId,
      ip,
      userAgent,
      metadata: { addressId, updatedFields: Object.keys(dto) },
    });

    this.logger.debug(`Address updated (${addressId}) by user ${userId}`);
    return plainToInstance(AddressResponseDto, updated, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Delete a user’s address.
   */
  async deleteAddress(
    userId: string,
    addressId: string,
    ip: string,
    userAgent: string,
  ): Promise<{ message: string }> {
    const address = await this.findOneByUser(userId, addressId);
    await this.addressRepository.remove(address);

    await this.auditService.enqueueLog({
      action: AuditAction.ADDRESS_DELETED,
      userId,
      ip,
      userAgent,
      metadata: { addressId },
    });

    this.logger.warn(`Address deleted (${addressId}) by user ${userId}`);
    return { message: 'Address deleted successfully' };
  }
}
