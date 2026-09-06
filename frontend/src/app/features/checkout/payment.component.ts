import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { CatalogService } from '../../core/catalog.service';
import { Quote, ShippingMethod } from '../../core/models';
import { OrdersService } from '../../core/orders.service';
import { MoneyPipe } from '../../shared/money.pipe';
import { StatePanelComponent } from '../../shared/state-panel.component';

interface CheckoutSession {
  url: string;
  sessionId: string;
}

/** Checkout step 3 — hand-off to Stripe's hosted page. No card data is ever entered here. */
@Component({
  selector: 'app-checkout-payment',
  standalone: true,
  imports: [RouterLink, MoneyPipe, StatePanelComponent],
  templateUrl: './payment.component.html',
  styleUrl: './payment.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiService);
  private readonly orders = inject(OrdersService);
  private readonly catalog = inject(CatalogService);

  readonly quoteId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('quoteId') ?? '')),
    { initialValue: this.route.snapshot.paramMap.get('quoteId') ?? '' },
  );

  /** Stripe sends the customer back with `?cancelled=1` when they abandon the hosted page. */
  readonly cancelled = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('cancelled') === '1')),
    { initialValue: this.route.snapshot.queryParamMap.get('cancelled') === '1' },
  );

  private readonly fetched = signal<Quote | null>(null);
  readonly quote = computed(() => this.orders.quoteById(this.quoteId()) ?? this.fetched());

  readonly sandbox = signal(false);
  readonly redirecting = signal(false);
  readonly failed = signal(false);
  readonly failureMessage = signal<string | null>(null);

  /** The delivery rate the customer chose at the previous step, read back off the quote. */
  readonly shipping = computed<ShippingMethod | null>(() => {
    const quote = this.quote();
    if (!quote?.shippingMethodId) return null;
    return (
      this.catalog
        .activeShipping(quote.nesting?.sheets ?? 1)
        .find((method) => method.id === quote.shippingMethodId) ?? null
    );
  });

  readonly shippingCents = computed(
    () => this.quote()?.shippingCents ?? this.shipping()?.computedCents ?? 0,
  );
  readonly amountDueCents = computed(
    () => (this.quote()?.totalCents ?? 0) + this.shippingCents(),
  );

  constructor() {
    effect(() => {
      const id = this.quoteId();
      untracked(() => void this.hydrate(id));
    });
    void this.loadAvailability();
  }

  private async hydrate(id: string): Promise<void> {
    if (!id) return;
    const quote = this.orders.quoteById(id) ?? (await this.orders.fetchQuote(id));
    this.fetched.set(quote);
    if (quote) await this.catalog.loadShipping(quote.nesting?.sheets ?? 1, true);
  }

  private async loadAvailability(): Promise<void> {
    try {
      const status = await this.api.post<{ cardPaymentsEnabled: boolean; sandboxMode: boolean }>(
        '/checkout/availability',
      );
      this.sandbox.set(status.sandboxMode);
      if (!status.cardPaymentsEnabled) {
        this.failed.set(true);
        this.failureMessage.set(
          'Card payments are not configured yet. Contact the workshop to complete this order.',
        );
      }
    } catch {
      /* the pay button surfaces the real error when pressed */
    }
  }

  /**
   * Creates a Stripe Checkout Session and hands the browser to Stripe's hosted page.
   * No order row exists until the signed webhook confirms the payment landed.
   */
  async pay(): Promise<void> {
    const quote = this.quote();
    if (!quote || this.redirecting()) return;

    this.failed.set(false);
    this.failureMessage.set(null);
    this.redirecting.set(true);
    try {
      const session = await this.api.post<CheckoutSession>(
        `/checkout/${encodeURIComponent(quote.id)}/session`,
        { returnOrigin: typeof location === 'undefined' ? undefined : location.origin },
      );
      window.location.assign(session.url);
    } catch (error) {
      this.redirecting.set(false);
      this.failed.set(true);
      this.failureMessage.set((error as Error).message);
    }
  }

  retry(): void {
    this.failed.set(false);
    this.failureMessage.set(null);
    void this.pay();
  }

  /**
   * Reviewer switch for the upstream-failure state. Compiled out of production
   * bundles — a live customer only ever sees this panel after a real Stripe failure.
   */
  simulateError(): void {
    if (!COLOSSUS_PREVIEW) return;
    this.redirecting.set(false);
    this.failed.set(true);
  }
}
