import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Params, Router, RouterLink } from '@angular/router';
import { Order, OrderStatus } from '../../core/models';
import { OrdersService } from '../../core/orders.service';
import { MoneyPipe } from '../../shared/money.pipe';
import { StatePanelComponent } from '../../shared/state-panel.component';

export type StatusFilter = 'all' | OrderStatus;

interface StatusOption { value: StatusFilter; label: string; }

const FILTERS: StatusFilter[] = ['all', 'PAID', 'FULFILLED', 'CANCELLED'];

/** `orders.list` — the signed-in customer's orders, filtered through `?status=`. */
@Component({
  selector: 'app-order-list',
  standalone: true,
  imports: [RouterLink, DatePipe, MoneyPipe, StatePanelComponent],
  templateUrl: './order-list.component.html',
  styleUrl: './order-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderListComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly orders = inject(OrdersService);

  /** Set while `GET /api/orders` is in flight. */
  readonly loading = this.orders.ordersLoading;
  /** Holds the message from a failed `GET /api/orders` call. */
  readonly loadError = this.orders.ordersError;

  constructor() {
    void this.orders.loadOrders();
  }

  readonly statusOptions: StatusOption[] = [
    { value: 'all', label: 'All' },
    { value: 'PAID', label: 'Paid' },
    { value: 'FULFILLED', label: 'Fulfilled' },
    { value: 'CANCELLED', label: 'Cancelled' },
  ];

  private readonly params = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  readonly status = computed<StatusFilter>(() => {
    const raw = this.params().get('status') as StatusFilter | null;
    return raw !== null && FILTERS.includes(raw) ? raw : 'all';
  });

  readonly total = computed(() => this.orders.orders().length);

  readonly visible = computed<Order[]>(() => {
    const rows = [...this.orders.orders()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const status = this.status();
    return status === 'all' ? rows : rows.filter((order) => order.status === status);
  });

  countFor(status: StatusFilter): number {
    const rows = this.orders.orders();
    return status === 'all' ? rows.length : rows.filter((order) => order.status === status).length;
  }

  badgeClass(status: OrderStatus): string {
    switch (status) {
      case 'FULFILLED':
        return 'badge badge-ok';
      case 'CANCELLED':
        return 'badge badge-err';
      default:
        return 'badge badge-info';
    }
  }

  statusLabel(status: OrderStatus): string {
    return status.charAt(0) + status.slice(1).toLowerCase();
  }

  setStatus(status: StatusFilter): void {
    this.write({ status: status === 'all' ? null : status });
  }

  private write(queryParams: Params): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
    });
  }
}
