import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { BrandingService } from '../../core/branding.service';
import { Order, OrderStatus } from '../../core/models';
import { OrdersService } from '../../core/orders.service';
import { MoneyPipe } from '../../shared/money.pipe';
import { StatePanelComponent } from '../../shared/state-panel.component';

/** The end of the journey — the order exists, the money has moved. */
@Component({
  selector: 'app-order-confirmation',
  standalone: true,
  imports: [DatePipe, RouterLink, MoneyPipe, StatePanelComponent],
  templateUrl: './confirmation.component.html',
  styleUrl: './confirmation.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmationComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly orders = inject(OrdersService);
  private readonly branding = inject(BrandingService);

  readonly orderId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('id') ?? '')),
    { initialValue: this.route.snapshot.paramMap.get('id') ?? '' },
  );

  private readonly fetched = signal<Order | null>(null);

  /**
   * The Stripe return URL carries the checkout session id, so the API resolves an
   * order by its id, its order number OR that session id — a fresh return still lands.
   */
  readonly order = computed(() => this.orders.orderById(this.orderId()) ?? this.fetched());
  readonly business = computed(() => this.branding.current());

  /** Direct link to the printable receipt for this order. */
  readonly receiptUrl = computed(() => {
    const order = this.order();
    return order ? this.orders.receiptUrl(order.id) : '';
  });

  constructor() {
    void this.branding.load();
    effect(() => {
      const id = this.orderId();
      untracked(() => {
        if (id && !this.orders.orderById(id)) {
          void this.orders.fetchOrder(id).then((order) => this.fetched.set(order));
        }
      });
    });
  }

  statusClass(status: OrderStatus): string {
    if (status === 'FULFILLED') return 'badge badge-ok';
    if (status === 'CANCELLED') return 'badge badge-err';
    return 'badge badge-info';
  }

  statusLabel(status: OrderStatus): string {
    if (status === 'FULFILLED') return 'Fulfilled';
    if (status === 'CANCELLED') return 'Cancelled';
    return 'Paid';
  }
}
