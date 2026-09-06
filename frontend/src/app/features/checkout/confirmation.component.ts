import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { BrandingService } from '../../core/branding.service';
import { OrderStatus } from '../../core/models';
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

  readonly order = computed(() => this.orders.orderById(this.orderId()));
  readonly business = computed(() => this.branding.current());

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
