import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { BrandingService } from '../../core/branding.service';
import { CatalogService } from '../../core/catalog.service';
import { Address, ShippingMethod } from '../../core/models';
import { OrdersService } from '../../core/orders.service';
import { MoneyPipe } from '../../shared/money.pipe';
import { StatePanelComponent } from '../../shared/state-panel.component';

const BLANK_ADDRESS: Address = {
  line1: '', line2: '', city: '', region: '', postalCode: '', country: '',
};

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
  private readonly orders = inject(OrdersService);
  private readonly catalog = inject(CatalogService);
  private readonly branding = inject(BrandingService);

  readonly quoteId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('quoteId') ?? '')),
    { initialValue: this.route.snapshot.paramMap.get('quoteId') ?? '' },
  );

  readonly quote = computed(() => this.orders.quoteById(this.quoteId()));
  readonly business = computed(() => this.branding.current());

  /** Per-sheet rates bill against the nest, so the sheet count drives the price. */
  readonly sheets = computed(() => this.quote()?.nesting.sheets ?? 1);

  /** Reviewer switch so the blocked state is reachable without touching the catalogue. */
  readonly previewEmpty = signal(false);

  readonly methods = computed<ShippingMethod[]>(() =>
    this.previewEmpty() ? [] : this.catalog.activeShipping(this.sheets()),
  );

  readonly selectedId = signal('');

  /** Falls back to the cheapest-listed method so the summary is never blank. */
  readonly selected = computed<ShippingMethod | null>(() => {
    const list = this.methods();
    return list.find((m) => m.id === this.selectedId()) ?? list[0] ?? null;
  });

  readonly blocked = computed(() => this.methods().length === 0);
  readonly shippingCents = computed(() => this.selected()?.computedCents ?? 0);
  readonly grandTotalCents = computed(() => (this.quote()?.totalCents ?? 0) + this.shippingCents());
  readonly canContinue = computed(() => !this.blocked() && this.selected() !== null);

  /** The customer's saved delivery addresses — replaced by `addresses.list` later. */
  readonly savedAddresses = signal<Address[]>([
    {
      line1: '88 Kestrel Way',
      line2: 'Unit 4',
      city: 'Beaverton',
      region: 'OR',
      postalCode: '97005',
      country: 'United States',
    },
  ]);

  private readonly prefill = this.savedAddresses()[0] ?? BLANK_ADDRESS;

  readonly line1 = signal(this.prefill.line1);
  readonly line2 = signal(this.prefill.line2);
  readonly city = signal(this.prefill.city);
  readonly region = signal(this.prefill.region);
  readonly postalCode = signal(this.prefill.postalCode);
  readonly country = signal(this.prefill.country);

  rateLabel(method: ShippingMethod): string {
    return method.rateType === 'FLAT'
      ? 'Flat rate'
      : `${(method.amountCents / 100).toFixed(2)} per sheet — ${this.sheets()} sheets`;
  }

  select(id: string): void {
    this.selectedId.set(id);
  }

  toggleEmpty(): void {
    this.previewEmpty.update((on) => !on);
  }

  continueToPayment(): void {
    if (!this.canContinue()) return;
    void this.router.navigate(['/checkout', this.quoteId(), 'payment']);
  }
}
