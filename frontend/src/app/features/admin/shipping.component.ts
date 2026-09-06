import { ChangeDetectionStrategy, Component, OnDestroy, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CatalogService } from '../../core/catalog.service';
import { ShippingMethod, ShippingRateType } from '../../core/models';
import { ModalComponent } from '../../shared/modal.component';
import { MoneyPipe } from '../../shared/money.pipe';
import { StatePanelComponent } from '../../shared/state-panel.component';

/**
 * Shipping method CRUD. Every dialog is addressed by `?modal=new|edit|delete`
 * (plus `?id=`), so each one is deep-linkable and survives a reload.
 */
@Component({
  selector: 'app-admin-shipping',
  standalone: true,
  imports: [FormsModule, ModalComponent, MoneyPipe, StatePanelComponent],
  templateUrl: './shipping.component.html',
  styleUrl: './shipping.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminShippingComponent implements OnDestroy {
  private readonly catalog = inject(CatalogService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private timer: ReturnType<typeof setTimeout> | null = null;

  private readonly params = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  readonly modal = computed(() => this.params().get('modal'));
  readonly targetId = computed(() => this.params().get('id'));

  readonly methods = this.catalog.shippingMethods;
  readonly activeCount = computed(() => this.methods().filter((m) => m.isActive).length);
  readonly target = computed(() => this.methods().find((m) => m.id === this.targetId()) ?? null);

  readonly saved = signal('');

  readonly name = signal('');
  readonly rateType = signal<ShippingRateType>('FLAT');
  /** Edited in whole currency units; stored as integer cents. */
  readonly amount = signal(0);
  readonly estDeliveryDays = signal(1);
  readonly isActive = signal(true);

  readonly nameError = computed(() => (this.name().trim().length === 0 ? 'Give the method a name.' : null));

  constructor() {
    effect(() => {
      const modal = this.modal();
      const id = this.targetId();
      untracked(() => {
        if (modal === 'new') {
          this.blankForm();
          return;
        }
        if (modal === 'edit') {
          const method = this.methods().find((m) => m.id === id);
          if (method) this.fillForm(method);
        }
      });
    });
  }

  rateLabel(rateType: ShippingRateType): string {
    return rateType === 'PER_SHEET' ? 'Per sheet' : 'Flat';
  }

  openNew(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { modal: 'new', id: null },
      queryParamsHandling: 'merge',
    });
  }

  openEdit(method: ShippingMethod): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { modal: 'edit', id: method.id },
      queryParamsHandling: 'merge',
    });
  }

  openDelete(method: ShippingMethod): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { modal: 'delete', id: method.id },
      queryParamsHandling: 'merge',
    });
  }

  close(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { modal: null, id: null },
      queryParamsHandling: 'merge',
    });
  }

  /** Reverts the dialog form to the stored row, or to the blank defaults when creating. */
  reset(): void {
    const method = this.target();
    if (this.modal() === 'edit' && method) this.fillForm(method);
    else this.blankForm();
  }

  save(): void {
    if (this.nameError() !== null) return;
    const amountCents = Math.round(this.amount() * 100);
    const editing = this.target();

    if (this.modal() === 'edit' && editing) {
      const next: ShippingMethod = {
        ...editing,
        name: this.name().trim(),
        rateType: this.rateType(),
        amountCents,
        computedCents: amountCents,
        estDeliveryDays: Math.round(this.estDeliveryDays()),
        isActive: this.isActive(),
      };
      this.catalog.shippingMethods.update((rows) => rows.map((row) => (row.id === next.id ? next : row)));
      this.flagSaved(`“${next.name}” updated and live at checkout.`);
    } else {
      const created: ShippingMethod = {
        id: `shp_${Date.now().toString(36)}`,
        name: this.name().trim(),
        rateType: this.rateType(),
        amountCents,
        computedCents: amountCents,
        estDeliveryDays: Math.round(this.estDeliveryDays()),
        isActive: this.isActive(),
      };
      this.catalog.shippingMethods.update((rows) => [...rows, created]);
      this.flagSaved(`“${created.name}” added and live at checkout.`);
    }
    this.close();
  }

  remove(): void {
    const method = this.target();
    if (!method) return;
    this.catalog.shippingMethods.update((rows) => rows.filter((row) => row.id !== method.id));
    this.flagSaved(`“${method.name}” deleted.`);
    this.close();
  }

  num(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  ngOnDestroy(): void {
    if (this.timer !== null) clearTimeout(this.timer);
  }

  private blankForm(): void {
    this.name.set('');
    this.rateType.set('FLAT');
    this.amount.set(0);
    this.estDeliveryDays.set(5);
    this.isActive.set(true);
  }

  private fillForm(method: ShippingMethod): void {
    this.name.set(method.name);
    this.rateType.set(method.rateType);
    this.amount.set(method.amountCents / 100);
    this.estDeliveryDays.set(method.estDeliveryDays);
    this.isActive.set(method.isActive);
  }

  private flagSaved(message: string): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.saved.set(message);
    this.timer = setTimeout(() => this.saved.set(''), 2600);
  }
}
