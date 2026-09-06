import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Params, Router, RouterLink } from '@angular/router';
import { Quote } from '../../core/models';
import { OrdersService } from '../../core/orders.service';
import { MoneyPipe } from '../../shared/money.pipe';
import { StatePanelComponent } from '../../shared/state-panel.component';

interface SheetTally { sheet: number; parts: number; }

/**
 * `quotes.getById`. The sheet-layout pane is addressed as `?panel=nesting`, so a
 * deep link opens it directly and the browser back button closes it.
 */
@Component({
  selector: 'app-quote-detail',
  standalone: true,
  imports: [RouterLink, DatePipe, MoneyPipe, StatePanelComponent],
  templateUrl: './quote-detail.component.html',
  styleUrl: './quote-detail.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuoteDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly orders = inject(OrdersService);

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  private readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  readonly quoteId = computed(() => this.params().get('id') ?? '');

  private readonly fetched = signal<Quote | null>(null);
  readonly quote = computed<Quote | null>(
    () => this.orders.quoteById(this.quoteId()) ?? this.fetched(),
  );

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

  readonly panelOpen = computed(() => this.query().get('panel') === 'nesting');

  /** Parts actually laid on each sheet, taken from the nest rather than assumed. */
  readonly sheetTallies = computed<SheetTally[]>(() => {
    const nesting = this.quote()?.nesting;
    if (!nesting) return [];
    const counts = new Map<number, number>();
    for (const placement of nesting.placements) {
      counts.set(placement.sheet, (counts.get(placement.sheet) ?? 0) + 1);
    }
    return Array.from({ length: nesting.sheets }, (_, index) => ({
      sheet: index + 1,
      parts: counts.get(index) ?? 0,
    }));
  });

  /** Cut length is per part; the machine runs it once for every part in the batch. */
  readonly totalCutMetres = computed(() => {
    const quote = this.quote();
    if (!quote) return '0.00';
    return ((quote.cutLengthMm * quote.quantity) / 1000).toFixed(2);
  });

  openPanel(): void {
    this.write({ panel: 'nesting' });
  }

  closePanel(): void {
    this.write({ panel: null });
  }

  private write(queryParams: Params): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
    });
  }
}
