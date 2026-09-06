import { Injectable, signal } from '@angular/core';
import { IntegrationSetting, MachineConfig, PaymentConfig, PricingConfig } from './models';

/** The `id = 1` singleton config rows plus the service/integration credential registry. */
@Injectable({ providedIn: 'root' })
export class ConfigService {
  readonly pricingConfig = signal<PricingConfig[]>([
    {
      costPerLinearFtCents: 285,
      setupFeeCents: 3500,
      handlingFeeCents: 1200,
      minOrderCents: 7500,
      costPerBendCents: 140,
    },
  ]);

  readonly machineConfig = signal<MachineConfig[]>([
    {
      bedWMm: 1500,
      bedHMm: 3000,
      spacingMm: 8,
      marginMm: 12,
      animationSpeed: 1.4,
      allowedExtensions: ['.dxf'],
      maxUploadBytes: 10 * 1024 * 1024,
      qtyMin: 1,
      qtyMax: 500,
    },
  ]);

  readonly paymentConfig = signal<PaymentConfig[]>([
    {
      stripePublishableKey: '',
      stripeSecretKeyMasked: '',
      stripeWebhookSecretMasked: '',
      sandboxMode: true,
    },
  ]);

  readonly integrationSettings = signal<IntegrationSetting[]>([
    { key: 'POSTGRESQL_API_KEY', label: 'PostgreSQL', kind: 'service', sdk: 'Primary datastore', maskedValue: '••••••••3f2a', configured: true },
    { key: 'MINIO_S3_COMPATIBLE_OBJECT_STORAGE_MINIO_SDK_API_KEY', label: 'MinIO / S3-compatible object storage', kind: 'service', sdk: 'minio SDK', maskedValue: '', configured: false },
    { key: 'REDIS_API_KEY', label: 'Redis', kind: 'integration', sdk: 'Rate limits and token denylist', maskedValue: '', configured: false },
    { key: 'RESEND_API_RESEND_SDK_API_KEY', label: 'Resend API', kind: 'integration', sdk: 'resend SDK', maskedValue: '', configured: false },
    { key: 'STRIPE_PYTHON_SDK_STRIPECLIENT_V15_6_API_KEY', label: 'Stripe Python SDK', kind: 'integration', sdk: 'StripeClient, v15.6', maskedValue: '', configured: false },
  ]);

  pricing(): PricingConfig { return this.pricingConfig()[0]; }
  machine(): MachineConfig { return this.machineConfig()[0]; }
  payment(): PaymentConfig { return this.paymentConfig()[0]; }

  unconfigured(): IntegrationSetting[] {
    return this.integrationSettings().filter((s) => !s.configured);
  }
}
