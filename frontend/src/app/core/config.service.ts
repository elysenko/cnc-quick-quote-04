import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { IntegrationSetting, MachineConfig, PaymentConfig, PricingConfig } from './models';

/**
 * The `id = 1` singleton config rows plus the service/integration credential registry.
 *
 * The defaults below are what the screens render for the instant before the first
 * response lands; every one of them is replaced by the API on load, and every save
 * goes back to the API. They exist so a slow network shows a laid-out form rather
 * than a blank one — the wizard's own guards refuse to price until real values arrive.
 */
const PENDING_PRICING: PricingConfig = {
  costPerLinearFtCents: 0,
  setupFeeCents: 0,
  handlingFeeCents: 0,
  minOrderCents: 0,
  costPerBendCents: 0,
};

const PENDING_MACHINE: MachineConfig = {
  bedWMm: 0,
  bedHMm: 0,
  spacingMm: 0,
  marginMm: 0,
  animationSpeed: 1,
  allowedExtensions: ['.dxf'],
  maxUploadBytes: 0,
  qtyMin: 1,
  qtyMax: 1,
};

const PENDING_PAYMENT: PaymentConfig = {
  stripePublishableKey: '',
  stripeSecretKeyMasked: '',
  stripeWebhookSecretMasked: '',
  sandboxMode: true,
};

@Injectable({ providedIn: 'root' })
export class ConfigService {
  private readonly api = inject(ApiService);

  readonly pricingConfig = signal<PricingConfig[]>([PENDING_PRICING]);
  readonly machineConfig = signal<MachineConfig[]>([PENDING_MACHINE]);
  readonly paymentConfig = signal<PaymentConfig[]>([PENDING_PAYMENT]);
  readonly integrationSettings = signal<IntegrationSetting[]>([]);

  /** True once the machine/pricing singletons have actually come back from the API. */
  readonly ready = signal(false);
  readonly saveError = signal<string | null>(null);

  private loading: Promise<void> | null = null;

  /** Idempotent: concurrent callers share one in-flight load. */
  load(force = false): Promise<void> {
    if (this.loading && !force) return this.loading;
    if (this.ready() && !force) return Promise.resolve();
    this.loading = this.fetchAll().finally(() => {
      this.loading = null;
    });
    return this.loading;
  }

  private async fetchAll(): Promise<void> {
    try {
      const [pricing, machine] = await Promise.all([
        this.api.get<PricingConfig>('/config/pricing'),
        this.api.get<MachineConfig>('/config/machine'),
      ]);
      this.pricingConfig.set([pricing]);
      this.machineConfig.set([machine]);
      this.ready.set(true);
    } catch {
      // Leave the pending defaults in place; the caller surfaces its own error state.
    }
  }

  async loadPayment(): Promise<void> {
    try {
      this.paymentConfig.set([await this.api.get<PaymentConfig>('/config/payment')]);
    } catch {
      /* the payment screen renders its unavailable state */
    }
  }

  async loadIntegrations(): Promise<void> {
    try {
      this.integrationSettings.set(await this.api.get<IntegrationSetting[]>('/admin/settings'));
    } catch {
      this.integrationSettings.set([]);
    }
  }

  pricing(): PricingConfig {
    return this.pricingConfig()[0];
  }

  machine(): MachineConfig {
    return this.machineConfig()[0];
  }

  payment(): PaymentConfig {
    return this.paymentConfig()[0];
  }

  unconfigured(): IntegrationSetting[] {
    return this.integrationSettings().filter((s) => !s.configured);
  }

  // --- Admin writes --------------------------------------------------------

  async savePricing(next: PricingConfig): Promise<void> {
    this.saveError.set(null);
    try {
      this.pricingConfig.set([await this.api.put<PricingConfig>('/admin/config/pricing', next)]);
    } catch (error) {
      this.saveError.set((error as Error).message);
      throw error;
    }
  }

  async saveMachine(next: MachineConfig): Promise<void> {
    this.saveError.set(null);
    try {
      this.machineConfig.set([await this.api.put<MachineConfig>('/admin/config/machine', next)]);
    } catch (error) {
      this.saveError.set((error as Error).message);
      throw error;
    }
  }

  /** Blank secret fields are omitted so the stored value is kept, never overwritten. */
  async savePayment(next: {
    stripePublishableKey: string;
    stripeSecretKey?: string;
    stripeWebhookSecret?: string;
    sandboxMode: boolean;
  }): Promise<void> {
    this.saveError.set(null);
    try {
      this.paymentConfig.set([await this.api.put<PaymentConfig>('/admin/config/payment', next)]);
    } catch (error) {
      this.saveError.set((error as Error).message);
      throw error;
    }
  }

  async saveIntegration(key: string, value: string): Promise<void> {
    this.integrationSettings.set(
      await this.api.put<IntegrationSetting[]>('/admin/settings', { key, value }),
    );
  }

  async clearIntegration(key: string): Promise<void> {
    this.integrationSettings.set(
      await this.api.delete<IntegrationSetting[]>(`/admin/settings/${encodeURIComponent(key)}`),
    );
  }
}
