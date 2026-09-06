import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { BrandingService } from '../../core/branding.service';
import { CatalogService } from '../../core/catalog.service';
import { Quote, ShippingMethod } from '../../core/models';
import { OrdersService } from '../../core/orders.service';
import { MoneyPipe } from '../../shared/money.pipe';
import { StatePanelComponent } from '../../shared/state-panel.component';

/** Checkout step 2 — delivery method and address. Blocks payment when nothing is priceable. */
@Component({
  selector: 'app-checkout-shipping',
  standalone: true,
  imports: [RouterLink, MoneyPipe, StatePanelComponent],
  templateUrl: './shipping.component.html',
  styleUrl: './shipping.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShippingComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly orders = inject(OrdersService);
  private readonly catalog = inject(CatalogService);
  private readonly branding = inject(BrandingService);

  readonly quoteId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('quoteId') ?? '')),
    { initialValue: this.route.snapshot.paramMap.get('quoteId') ?? '' },
  );

  private readonly fetched = signal<Quote | null>(null);
  readonly quote = computed(
    () => this.orders.quoteById(this.quoteId()) ?? this.fetched(),
  );
  readonly business = computed(() => this.branding.current());

  /** Per-sheet rates bill against the nest, so the sheet count drives the price. */
  readonly sheets = computed(() => this.quote()?.nesting?.sheets ?? 1);

  /**
   * Reviewer switch for the blocked state. Compiled out of production bundles —
   * a live customer's shipping options always mirror the carrier table exactly.
   */
  readonly previewEmpty = signal(false);

  readonly methods = computed<ShippingMethod[]>(() =>
    this.previewEmpty() ? [] : this.catalog.activeShipping(this.sheets()),
  );

  readonly selectedId = signal('');
  readonly submitError = signal<string | null>(null);
  readonly submitting = signal(false);

  /** Falls back to the cheapest-listed method so the summary is never blank. */
  readonly selected = computed<ShippingMethod | null>(() => {
    const list = this.methods();
    return list.find((m) => m.id === this.selectedId()) ?? list[0] ?? null;
  });

  readonly blocked = computed(() => this.methods().length === 0);
  readonly shippingCents = computed(() => this.selected()?.computedCents ?? 0);
  readonly grandTotalCents = computed(
    () => (this.quote()?.totalCents ?? 0) + this.shippingCents(),
  );

  readonly line1 = signal('');
  readonly line2 = signal('');
  readonly city = signal('');
  readonly region = signal('');
  readonly postalCode = signal('');
  readonly country = signal('');

  readonly addressComplete = computed(
    () =>
      this.line1().trim().length > 0 &&
      this.city().trim().length > 0 &&
      this.postalCode().trim().length > 0 &&
      this.country().trim().length > 0,
  );

  readonly canContinue = computed(
    () => !this.blocked() && this.selected() !== null && this.addressComplete() && !this.submitting(),
  );

  constructor() {
    void this.branding.load();

    effect(() => {
      const id = this.quoteId();
      untracked(() => void this.hydrate(id));
    });

    // Rates depend on the nest, so they are re-read once the quote's sheet count is known.
    effect(() => {
      const sheets = this.sheets();
      untracked(() => void this.catalog.loadShipping(sheets, true));
    });
  }

  /** Restores any delivery choice already saved against this quote, so a reload keeps it. */
  private async hydrate(id: string): Promise<void> {
    if (!id) return;
    const quote = this.orders.quoteById(id) ?? (await this.orders.fetchQuote(id));
    this.fetched.set(quote);
    if (!quote) return;
    if (quote.shippingMethodId) this.selectedId.set(quote.shippingMethodId);
    const address = quote.shippingAddress;
    if (address) {
      this.line1.set(address.line1);
      this.line2.set(address.line2);
      this.city.set(address.city);
      this.region.set(address.region);
      this.postalCode.set(address.postalCode);
      this.country.set(address.country);
    }
  }

  rateLabel(method: ShippingMethod): string {
    return method.rateType === 'FLAT'
      ? 'Flat rate'
      : `${(method.amountCents / 100).toFixed(2)} per sheet — ${this.sheets()} sheets`;
  }

  select(id: string): void {
    this.selectedId.set(id);
  }

  toggleEmpty(): void {
    if (!COLOSSUS_PREVIEW) return;
    this.previewEmpty.update((on) => !on);
  }

  /** Persists the choice on the quote, so payment charges exactly what was picked. */
  async continueToPayment(): Promise<void> {
    const quote = this.quote();
    const method = this.selected();
    if (!quote || !method || !this.canContinue()) return;

    this.submitting.set(true);
    this.submitError.set(null);
    try {
      const updated = await this.api.put<Quote>(
        `/quotes/${encodeURIComponent(quote.id)}/shipping`,
        {
          shippingMethodId: method.id,
          line1: this.line1().trim(),
          line2: this.line2().trim(),
          city: this.city().trim(),
          region: this.region().trim(),
          postalCode: this.postalCode().trim(),
          country: this.country().trim(),
        },
      );
      this.orders.addQuote(updated);
      this.fetched.set(updated);
      await this.router.navigate(['/checkout', quote.id, 'payment']);
    } catch (error) {
      this.submitError.set((error as Error).message);
    } finally {
      this.submitting.set(false);
    }
  }
}
