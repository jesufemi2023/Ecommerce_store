import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AddressService } from './addresses.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@Controller('addresses')
@UseGuards(JwtAuthGuard) // Protect all endpoints with JWT authentication
export class AddressController {
  private readonly logger = new Logger(AddressController.name);

  constructor(private readonly addressService: AddressService) {}

  /**
   * Create a new address
   * Route: POST /addresses
   */
  @Post()
  async createAddress(@Req() req, @Body() dto: CreateAddressDto) {
    const userId = req.user.id;
    const ip = req.ip;
    const userAgent = req.headers['user-agent'] || 'unknown';

    this.logger.debug(`Creating new address for user ${userId}`);
    const address = await this.addressService.createAddress(
      userId,
      dto,
      ip,
      userAgent,
    );
    return address; // Your global response interceptor will wrap this automatically
  }

  /**
   * Get all addresses for the authenticated user
   * Route: GET /addresses
   */
  @Get()
  async findAll(@Req() req) {
    const userId = req.user.id;
    return this.addressService.findAllByUser(userId);
  }

  /**
   * Get a single address by ID
   * Route: GET /addresses/:id
   */
  @Get(':id')
  async findOne(@Req() req, @Param('id') id: string) {
    const userId = req.user.id;
    return this.addressService.findOneByUser(userId, id);
  }

  /**
   * Update an address
   * Route: PATCH /addresses/:id
   */
  @Patch(':id')
  async updateAddress(
    @Req() req,
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    const userId = req.user.id;
    const ip = req.ip;
    const userAgent = req.headers['user-agent'] || 'unknown';

    this.logger.debug(`Updating address ${id} for user ${userId}`);
    return this.addressService.updateAddress(userId, id, dto, ip, userAgent);
  }

  /**
   * Delete an address
   * Route: DELETE /addresses/:id
   */
  @Delete(':id')
  async deleteAddress(@Req() req, @Param('id') id: string) {
    const userId = req.user.id;
    const ip = req.ip;
    const userAgent = req.headers['user-agent'] || 'unknown';

    this.logger.warn(`Deleting address ${id} for user ${userId}`);
    return this.addressService.deleteAddress(userId, id, ip, userAgent);
  }
}
