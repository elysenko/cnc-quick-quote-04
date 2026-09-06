import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { CatalogService } from '../../core/catalog.service';
import { ConfigService } from '../../core/config.service';
import { OrdersService } from '../../core/orders.service';
import { MoneyPipe } from '../../shared/money.pipe';
import { StatePanelComponent } from '../../shared/state-panel.component';

/** The demo order the hosted-checkout return lands on. */
const DEMO_ORDER_ID = 'ord_5501';
const REDIRECT_MS = 1200;

/** Checkout step 3 — hand-off to Stripe's hosted page. No card data is ever entered here. */
@Component({
  selector: 'app-checkout-payment',
  standalone: true,
  imports: [RouterLink, MoneyPipe, StatePanelComponent],
  templateUrl: './payment.component.html',
  styleUrl: './payment.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentComponent implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly orders = inject(OrdersService);
  private readonly catalog = inject(CatalogService);
  private readonly config = inject(ConfigService);

  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly quoteId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('quoteId') ?? '')),
    { initialValue: this.route.snapshot.paramMap.get('quoteId') ?? '' },
  );

  /** Stripe sends the customer back with `?cancelled=1` when they abandon the hosted page. */
  readonly cancelled = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('cancelled') === '1')),
    { initialValue: this.route.snapshot.queryParamMap.get('cancelled') === '1' },
  );

  readonly quote = computed(() => this.orders.quoteById(this.quoteId()));
  readonly payment = computed(() => this.config.payment());
  readonly sandbox = computed(() => this.payment().sandboxMode);

  readonly redirecting = signal(false);
  readonly failed = signal(false);

  /** The delivery rate chosen at the previous step; the first active rate stands in for it. */
  readonly shipping = computed(() => {
    const sheets = this.quote()?.nesting.sheets ?? 1;
    return this.catalog.activeShipping(sheets)[0] ?? null;
  });

  readonly shippingCents = computed(() => this.shipping()?.computedCents ?? 0);
  readonly amountDueCents = computed(() => (this.quote()?.totalCents ?? 0) + this.shippingCents());

  pay(): void {
    if (this.redirecting()) return;
    this.failed.set(false);
    this.redirecting.set(true);
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.router.navigate(['/orders', DEMO_ORDER_ID, 'confirmation']);
    }, REDIRECT_MS);
  }

  retry(): void {
    this.failed.set(false);
    this.redirecting.set(false);
    this.clearTimer();
    this.pay();
  }

  /** Reviewer switch for the 502 upstream-failure state. */
  simulateError(): void {
    this.clearTimer();
    this.redirecting.set(false);
    this.failed.set(true);
  }

  ngOnDestroy(): void {
    this.clearTimer();
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
