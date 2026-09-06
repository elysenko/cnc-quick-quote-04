import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/auth.guard';
import { SettingsService } from './settings.service';

interface BrandingView {
  companyName: string;
  logoUrl: string;
  primaryColor: string;
  accentColor: string;
  contactEmail: string;
  contactPhone: string;
  supportHours: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}

/** Reads every signed-in screen needs. Branding is public so /login can theme itself. */
@ApiTags('config')
@Controller()
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Public()
  @Get('branding')
  async branding(): Promise<BrandingView> {
    const { id: _id, updatedAt: _updatedAt, ...view } = await this.settings.business();
    return view;
  }

  @Get('config/pricing')
  async pricing() {
    const { id: _id, updatedAt: _updatedAt, ...view } = await this.settings.pricing();
    return view;
  }

  @Get('config/machine')
  async machine() {
    const { id: _id, updatedAt: _updatedAt, ...view } = await this.settings.machine();
    return view;
  }

  @Get('config/payment')
  payment() {
    return this.settings.paymentView();
  }
}
