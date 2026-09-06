import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Params, Router, RouterLink } from '@angular/router';
import { Quote } from '../../core/models';
import { OrdersService } from '../../core/orders.service';
import { MoneyPipe } from '../../shared/money.pipe';
import { StatePanelComponent } from '../../shared/state-panel.component';

export type QuoteSort = 'newest' | 'oldest' | 'total-desc' | 'total-asc';

interface SortOption { value: QuoteSort; label: string; }

const PAGE_SIZE = 10;
const SORT_KEYS: QuoteSort[] = ['newest', 'oldest', 'total-desc', 'total-asc'];

/**
 * `quotes.list`. Page and sort live in the URL (`?page=&sort=`) so a listing is
 * shareable and survives a hard reload — the component never holds them locally.
 */
@Component({
  selector: 'app-quote-list',
  standalone: true,
  imports: [RouterLink, DatePipe, MoneyPipe, StatePanelComponent],
  templateUrl: './quote-list.component.html',
  styleUrl: './quote-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuoteListComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly orders = inject(OrdersService);

  /** Set while `GET /api/quotes` is in flight. */
  readonly loading = this.orders.quotesLoading;
  readonly loadError = this.orders.quotesError;

  constructor() {
    void this.orders.loadQuotes();
  }

  readonly pageSize = PAGE_SIZE;

  readonly sortOptions: SortOption[] = [
    { value: 'newest', label: 'Newest first' },
    { value: 'oldest', label: 'Oldest first' },
    { value: 'total-desc', label: 'Highest total' },
    { value: 'total-asc', label: 'Lowest total' },
  ];

  private readonly params = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  readonly sort = computed<QuoteSort>(() => {
    const raw = this.params().get('sort') as QuoteSort | null;
    return raw !== null && SORT_KEYS.includes(raw) ? raw : 'newest';
  });

  readonly total = computed(() => this.orders.quotes().length);
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));

  readonly page = computed(() => {
    const raw = Number.parseInt(this.params().get('page') ?? '1', 10);
    const requested = Number.isFinite(raw) && raw > 0 ? raw : 1;
    return Math.min(requested, this.pageCount());
  });

  readonly sorted = computed<Quote[]>(() => {
    const rows = [...this.orders.quotes()];
    switch (this.sort()) {
      case 'oldest':
        return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      case 'total-desc':
        return rows.sort((a, b) => b.totalCents - a.totalCents);
      case 'total-asc':
        return rows.sort((a, b) => a.totalCents - b.totalCents);
      default:
        return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
  });

  readonly visible = computed<Quote[]>(() => {
    const start = (this.page() - 1) * PAGE_SIZE;
    return this.sorted().slice(start, start + PAGE_SIZE);
  });

  readonly firstIndex = computed(() => (this.total() === 0 ? 0 : (this.page() - 1) * PAGE_SIZE + 1));
  readonly lastIndex = computed(() => Math.min(this.page() * PAGE_SIZE, this.total()));
  readonly hasPrev = computed(() => this.page() > 1);
  readonly hasNext = computed(() => this.page() < this.pageCount());

  setSort(value: string): void {
    const next = SORT_KEYS.includes(value as QuoteSort) ? (value as QuoteSort) : 'newest';
    this.write({ sort: next, page: 1 });
  }

  goTo(page: number): void {
    const clamped = Math.min(Math.max(page, 1), this.pageCount());
    this.write({ page: clamped });
  }

  /** One writer for the URL state, so the view can only ever mirror the address bar. */
  private write(queryParams: Params): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
    });
  }
}
