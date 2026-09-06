import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfigService } from '../../core/config.service';
import { PaymentConfig } from '../../core/models';

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

  constructor() {
    this.reset();
  }

  reset(): void {
    const payment = this.config.payment();
    this.publishableKey.set(payment.stripePublishableKey);
    this.secretKey.set('');
    this.webhookSecret.set('');
    this.sandboxMode.set(payment.sandboxMode);
    this.saved.set(false);
  }

  save(): void {
    const payment = this.config.payment();
    const next: PaymentConfig = {
      stripePublishableKey: this.publishableKey().trim(),
      stripeSecretKeyMasked: this.maskOrKeep(this.secretKey(), payment.stripeSecretKeyMasked),
      stripeWebhookSecretMasked: this.maskOrKeep(this.webhookSecret(), payment.stripeWebhookSecretMasked),
      sandboxMode: this.sandboxMode(),
    };
    this.config.paymentConfig.update((rows) => [next, ...rows.slice(1)]);
    this.secretKey.set('');
    this.webhookSecret.set('');
    this.flagSaved();
  }

  ngOnDestroy(): void {
    if (this.timer !== null) clearTimeout(this.timer);
  }

  /** Blank input means "leave the stored secret alone"; a mask is never re-saved as plaintext. */
  private maskOrKeep(typed: string, current: string): string {
    const value = typed.trim();
    if (value.length === 0) return current;
    return `••••••••${value.slice(-4)}`;
  }

  private flagSaved(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.saved.set(true);
    this.timer = setTimeout(() => this.saved.set(false), 2600);
  }
}
