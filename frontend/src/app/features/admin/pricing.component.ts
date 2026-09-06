import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfigService } from '../../core/config.service';
import { PricingConfig } from '../../core/models';
import { MoneyPipe } from '../../shared/money.pipe';

/**
 * The `id = 1` pricing singleton. Money is stored as integer cents but edited in
 * whole currency units, so every field converts on load and on save.
 */
@Component({
  selector: 'app-admin-pricing',
  standalone: true,
  imports: [FormsModule, MoneyPipe],
  templateUrl: './pricing.component.html',
  styleUrl: './pricing.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPricingComponent implements OnDestroy {
  private readonly config = inject(ConfigService);
  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly saved = signal(false);

  readonly costPerLinearFt = signal(0);
  readonly setupFee = signal(0);
  readonly handlingFee = signal(0);
  readonly minOrder = signal(0);
  readonly costPerBend = signal(0);

  /** A worked example so the reviewer can see the rate applied to a real cut length. */
  readonly exampleFeet = 69.75;
  readonly exampleCents = computed(() =>
    Math.round(this.exampleFeet * this.toCents(this.costPerLinearFt())),
  );

  readonly saveError = signal<string | null>(null);
  readonly saving = signal(false);

  constructor() {
    // Values come from the API; the form fills in as soon as they land.
    void this.config.load().then(() => this.reset());
  }

  /** Re-reads the stored config, discarding anything typed since the last save. */
  reset(): void {
    const pricing = this.config.pricing();
    this.costPerLinearFt.set(this.toUnits(pricing.costPerLinearFtCents));
    this.setupFee.set(this.toUnits(pricing.setupFeeCents));
    this.handlingFee.set(this.toUnits(pricing.handlingFeeCents));
    this.minOrder.set(this.toUnits(pricing.minOrderCents));
    this.costPerBend.set(this.toUnits(pricing.costPerBendCents));
    this.saved.set(false);
  }

  async save(): Promise<void> {
    if (this.saving()) return;
    const next: PricingConfig = {
      costPerLinearFtCents: this.toCents(this.costPerLinearFt()),
      setupFeeCents: this.toCents(this.setupFee()),
      handlingFeeCents: this.toCents(this.handlingFee()),
      minOrderCents: this.toCents(this.minOrder()),
      costPerBendCents: this.toCents(this.costPerBend()),
    };
    this.saving.set(true);
    this.saveError.set(null);
    try {
      await this.config.savePricing(next);
      this.flagSaved();
    } catch (error) {
      this.saveError.set((error as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  num(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  ngOnDestroy(): void {
    if (this.timer !== null) clearTimeout(this.timer);
  }

  private flagSaved(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.saved.set(true);
    this.timer = setTimeout(() => this.saved.set(false), 2600);
  }

  private toUnits(cents: number): number {
    return Math.round(cents) / 100;
  }

  private toCents(units: number): number {
    return Math.round(units * 100);
  }
}
