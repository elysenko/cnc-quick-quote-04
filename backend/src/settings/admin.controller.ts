import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Material, Role, ShippingMethod } from '@prisma/client';
import { Roles } from '../auth/auth.guard';
import { RateLimit } from '../common/rate-limit.guard';
import { RuntimeConfigService } from '../common/runtime-config.service';
import { CatalogService } from '../catalog/catalog.service';
import {
  BusinessConfigDto,
  MachineConfigDto,
  MaterialDto,
  PaymentConfigDto,
  PricingConfigDto,
  ShippingMethodDto,
  SystemSettingDto,
} from './settings.dto';
import { IntegrationSettingDto, INTEGRATION_REGISTRY, SettingsService } from './settings.service';

/** Every route here is administrator-only: 403 for a signed-in customer, 401 for none. */
@ApiTags('admin')
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly settings: SettingsService,
    private readonly catalog: CatalogService,
    private readonly runtime: RuntimeConfigService,
  ) {}

  // --- Materials -----------------------------------------------------------
  @Get('materials')
  materials(): Promise<Material[]> {
    return this.catalog.listMaterials(true);
  }

  @Post('materials')
  createMaterial(@Body() dto: MaterialDto): Promise<Material> {
    return this.catalog.createMaterial(dto);
  }

  @Put('materials/:id')
  updateMaterial(@Param('id') id: string, @Body() dto: MaterialDto): Promise<Material> {
    return this.catalog.updateMaterial(id, dto);
  }

  @Delete('materials/:id')
  @HttpCode(204)
  deleteMaterial(@Param('id') id: string): Promise<void> {
    return this.catalog.deleteMaterial(id);
  }

  // --- Shipping ------------------------------------------------------------
  @Get('shipping-methods')
  shipping(): Promise<ShippingMethod[]> {
    return this.catalog.listShipping(true, 1);
  }

  @Post('shipping-methods')
  createShipping(@Body() dto: ShippingMethodDto): Promise<ShippingMethod> {
    return this.catalog.createShipping(dto);
  }

  @Put('shipping-methods/:id')
  updateShipping(@Param('id') id: string, @Body() dto: ShippingMethodDto): Promise<ShippingMethod> {
    return this.catalog.updateShipping(id, dto);
  }

  @Delete('shipping-methods/:id')
  @HttpCode(204)
  deleteShipping(@Param('id') id: string): Promise<void> {
    return this.catalog.deleteShipping(id);
  }

  // --- Singleton configuration --------------------------------------------
  @Put('config/pricing')
  async pricing(@Body() dto: PricingConfigDto) {
    const { id: _id, updatedAt: _u, ...view } = await this.settings.updatePricing(dto);
    return view;
  }

  @Put('config/machine')
  async machine(@Body() dto: MachineConfigDto) {
    const normalised = {
      ...dto,
      allowedExtensions: dto.allowedExtensions.map((entry) =>
        entry.trim().toLowerCase().startsWith('.')
          ? entry.trim().toLowerCase()
          : `.${entry.trim().toLowerCase()}`,
      ),
    };
    const { id: _id, updatedAt: _u, ...view } = await this.settings.updateMachine(normalised);
    return view;
  }

  @Put('config/business')
  async business(@Body() dto: BusinessConfigDto) {
    const { id: _id, updatedAt: _u, ...view } = await this.settings.updateBusiness(dto);
    return view;
  }

  /** Blank secret fields keep the stored value; a supplied one replaces it and is never echoed. */
  @Put('config/payment')
  @RateLimit({ bucket: 'admin-payment', limit: 20, windowSeconds: 300 })
  async payment(@Body() dto: PaymentConfigDto) {
    const data: Record<string, unknown> = {
      stripePublishableKey: dto.stripePublishableKey?.trim() ?? '',
      sandboxMode: dto.sandboxMode,
    };
    if (dto.stripeSecretKey?.trim()) data['stripeSecretKey'] = dto.stripeSecretKey.trim();
    if (dto.stripeWebhookSecret?.trim()) {
      data['stripeWebhookSecret'] = dto.stripeWebhookSecret.trim();
    }
    await this.settings.updatePayment(data);
    return this.settings.paymentView();
  }

  // --- Credential registry -------------------------------------------------
  @Get('settings')
  integrations(): Promise<IntegrationSettingDto[]> {
    return this.settings.integrationSettings();
  }

  @Put('settings')
  @RateLimit({ bucket: 'admin-settings', limit: 30, windowSeconds: 300 })
  async saveIntegration(@Body() dto: SystemSettingDto): Promise<IntegrationSettingDto[]> {
    if (INTEGRATION_REGISTRY.some((entry) => entry.key === dto.key)) {
      await this.runtime.setConfig(dto.key, dto.value);
    }
    return this.settings.integrationSettings();
  }

  @Delete('settings/:key')
  async clearIntegration(@Param('key') key: string): Promise<IntegrationSettingDto[]> {
    await this.runtime.clearConfig(key);
    return this.settings.integrationSettings();
  }
}
