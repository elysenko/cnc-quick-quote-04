import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { Quote } from '../../core/models';
import { OrdersService } from '../../core/orders.service';
import { MoneyPipe } from '../../shared/money.pipe';
import { StatePanelComponent } from '../../shared/state-panel.component';

const MM_PER_FT = 304.8;

/** Checkout step 1 — the locked quote, itemised, before shipping is chosen. */
@Component({
  selector: 'app-checkout-review',
  standalone: true,
  imports: [DatePipe, RouterLink, MoneyPipe, StatePanelComponent],
  templateUrl: './review.component.html',
  styleUrl: './review.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly orders = inject(OrdersService);

  readonly quoteId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('quoteId') ?? '')),
    { initialValue: this.route.snapshot.paramMap.get('quoteId') ?? '' },
  );

  private readonly fetched = signal<Quote | null>(null);

  /** Resolves from the cache when arriving from the wizard, from the API on a deep link. */
  readonly quote = computed(() => this.orders.quoteById(this.quoteId()) ?? this.fetched());

  constructor() {
    effect(() => {
      const id = this.quoteId();
      untracked(() => {
        if (id && !this.orders.quoteById(id)) {
          void this.orders.fetchQuote(id).then((quote) => this.fetched.set(quote));
        }
      });
    });
  }

  /** Cut length is stored per part in millimetres; shops think in linear feet. */
  readonly perPartFt = computed(() => ((this.quote()?.cutLengthMm ?? 0) / MM_PER_FT).toFixed(2));

  readonly totalFt = computed(() => {
    const quote = this.quote();
    if (!quote) return '0.00';
    return ((quote.cutLengthMm * quote.quantity) / MM_PER_FT).toFixed(2);
  });
}
