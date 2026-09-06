import { Injectable } from '@nestjs/common';
import {
  BusinessConfig,
  MachineConfig,
  PaymentConfig,
  PricingConfig,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RuntimeConfigService } from '../common/runtime-config.service';

/** Env keys the platform injects for the integrations this app talks to. */
export const INTEGRATION_REGISTRY = [
  {
    key: 'POSTGRESQL_API_KEY',
    label: 'PostgreSQL',
    kind: 'service' as const,
    sdk: 'Primary datastore',
    envAliases: ['DATABASE_URL'],
  },
  {
    key: 'MINIO_S3_COMPATIBLE_OBJECT_STORAGE_MINIO_SDK_API_KEY',
    label: 'MinIO / S3-compatible object storage',
    kind: 'service' as const,
    sdk: 'minio SDK',
    envAliases: ['MINIO_ROOT_PASSWORD', 'MINIO_SECRET_KEY'],
  },
  {
    key: 'REDIS_API_KEY',
    label: 'Redis',
    kind: 'integration' as const,
    sdk: 'Rate limits and token denylist',
    envAliases: ['REDIS_URL'],
  },
  {
    key: 'RESEND_API_RESEND_SDK_API_KEY',
    label: 'Resend API',
    kind: 'integration' as const,
    sdk: 'resend SDK',
    envAliases: ['RESEND_API_KEY'],
  },
  {
    key: 'STRIPE_PYTHON_SDK_STRIPECLIENT_V15_6_API_KEY',
    label: 'Stripe Python SDK',
    kind: 'integration' as const,
    sdk: 'StripeClient, v15.6',
    envAliases: ['STRIPE_SECRET_KEY'],
  },
];

export interface IntegrationSettingDto {
  key: string;
  label: string;
  kind: 'service' | 'integration';
  sdk: string;
  maskedValue: string;
  configured: boolean;
}

/**
 * The four `id = 1` singletons. Each is materialised with its schema defaults on
 * first read so a fresh database is immediately usable — this is configuration,
 * not sample business data.
 */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runtime: RuntimeConfigService,
  ) {}

  pricing(): Promise<PricingConfig> {
    return this.prisma.pricingConfig.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  }

  machine(): Promise<MachineConfig> {
    return this.prisma.machineConfig.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  }

  business(): Promise<BusinessConfig> {
    return this.prisma.businessConfig.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  }

  payment(): Promise<PaymentConfig> {
    return this.prisma.paymentConfig.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  }

  updatePricing(data: Partial<PricingConfig>): Promise<PricingConfig> {
    return this.prisma.pricingConfig.upsert({
      where: { id: 1 },
      update: data,
      create: { id: 1, ...data },
    });
  }

  updateMachine(data: Partial<MachineConfig>): Promise<MachineConfig> {
    return this.prisma.machineConfig.upsert({
      where: { id: 1 },
      update: data,
      create: { id: 1, ...data },
    });
  }

  updateBusiness(data: Partial<BusinessConfig>): Promise<BusinessConfig> {
    return this.prisma.businessConfig.upsert({
      where: { id: 1 },
      update: data,
      create: { id: 1, ...data },
    });
  }

  updatePayment(data: Partial<PaymentConfig>): Promise<PaymentConfig> {
    return this.prisma.paymentConfig.upsert({
      where: { id: 1 },
      update: data,
      create: { id: 1, ...data },
    });
  }

  /** Secrets are never returned in full — the console only ever sees the last four characters. */
  async paymentView(): Promise<{
    stripePublishableKey: string;
    stripeSecretKeyMasked: string;
    stripeWebhookSecretMasked: string;
    sandboxMode: boolean;
  }> {
    const config = await this.payment();
    const envSecret = await this.runtime.resolveFirst(
      'STRIPE_PYTHON_SDK_STRIPECLIENT_V15_6_API_KEY',
      'STRIPE_SECRET_KEY',
    );
    return {
      stripePublishableKey: config.stripePublishableKey,
      stripeSecretKeyMasked: RuntimeConfigService.mask(config.stripeSecretKey || envSecret),
      stripeWebhookSecretMasked: RuntimeConfigService.mask(
        config.stripeWebhookSecret || process.env.STRIPE_WEBHOOK_SECRET || '',
      ),
      sandboxMode: config.sandboxMode,
    };
  }

  async integrationSettings(): Promise<IntegrationSettingDto[]> {
    const rows: IntegrationSettingDto[] = [];
    for (const entry of INTEGRATION_REGISTRY) {
      const value = await this.runtime.resolveFirst(entry.key, ...entry.envAliases);
      rows.push({
        key: entry.key,
        label: entry.label,
        kind: entry.kind,
        sdk: entry.sdk,
        maskedValue: RuntimeConfigService.mask(value),
        configured: value !== null,
      });
    }
    return rows;
  }
}
