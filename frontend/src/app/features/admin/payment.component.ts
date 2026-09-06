import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfigService } from '../../core/config.service';

/**
 * Stripe credentials. The secret and webhook signing secret are write-only: the
 * inputs start empty on every load and the API only ever returns a masked value.
 */
@Component({
  selector: 'app-admin-payment',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './payment.component.html',
  styleUrl: './payment.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPaymentComponent implements OnDestroy {
  private readonly config = inject(ConfigService);
  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly saved = signal(false);

  readonly publishableKey = signal('');
  /** Never prefilled — typing a value replaces the stored secret, leaving it blank keeps it. */
  readonly secretKey = signal('');
  readonly webhookSecret = signal('');
  readonly sandboxMode = signal(true);

  readonly stored = computed(() => this.config.paymentConfig()[0]);
  readonly secretKeyMasked = computed(() => this.stored().stripeSecretKeyMasked);
  readonly webhookSecretMasked = computed(() => this.stored().stripeWebhookSecretMasked);

  readonly saveError = signal<string | null>(null);
  readonly saving = signal(false);

  constructor() {
    void this.config.loadPayment().then(() => this.reset());
  }

  reset(): void {
    const payment = this.config.payment();
    this.publishableKey.set(payment.stripePublishableKey);
    this.secretKey.set('');
    this.webhookSecret.set('');
    this.sandboxMode.set(payment.sandboxMode);
    this.saved.set(false);
  }

  /**
   * Secrets are write-only. A blank field is omitted from the request entirely, so
   * the stored value is kept; a filled one replaces it and is never echoed back.
   */
  async save(): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    this.saveError.set(null);
    try {
      await this.config.savePayment({
        stripePublishableKey: this.publishableKey().trim(),
        ...(this.secretKey().trim() ? { stripeSecretKey: this.secretKey().trim() } : {}),
        ...(this.webhookSecret().trim()
          ? { stripeWebhookSecret: this.webhookSecret().trim() }
          : {}),
        sandboxMode: this.sandboxMode(),
      });
      this.secretKey.set('');
      this.webhookSecret.set('');
      this.flagSaved();
    } catch (error) {
      this.saveError.set((error as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  ngOnDestroy(): void {
    if (this.timer !== null) clearTimeout(this.timer);
  }

  private flagSaved(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.saved.set(true);
    this.timer = setTimeout(() => this.saved.set(false), 2600);
  }
}
