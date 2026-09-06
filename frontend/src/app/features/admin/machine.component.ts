import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfigService } from '../../core/config.service';
import { MachineConfig } from '../../core/models';

/**
 * The `id = 1` machine singleton: bed geometry, nesting clearances, and the
 * upload/quantity bounds the quote wizard validates against.
 */
@Component({
  selector: 'app-admin-machine',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './machine.component.html',
  styleUrl: './machine.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminMachineComponent implements OnDestroy {
  private readonly config = inject(ConfigService);
  private readonly bytesPerMb = 1024 * 1024;
  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly saved = signal(false);

  readonly bedW = signal(0);
  readonly bedH = signal(0);
  readonly spacing = signal(0);
  readonly margin = signal(0);
  readonly animationSpeed = signal(1);
  /** Comma-separated in the form, split back into an array on save. */
  readonly extensions = signal('');
  readonly maxUploadMb = signal(0);
  readonly qtyMin = signal(1);
  readonly qtyMax = signal(1);

  readonly quantityError = computed(() =>
    this.qtyMin() > this.qtyMax() ? 'Minimum quantity cannot exceed the maximum.' : null,
  );
  readonly extensionsError = computed(() =>
    this.parseExtensions().length === 0 ? 'List at least one file extension.' : null,
  );
  readonly marginError = computed(() =>
    this.margin() * 2 >= Math.min(this.bedW(), this.bedH())
      ? 'Edge margin must be less than half the shortest bed dimension.'
      : null,
  );
  readonly invalid = computed(
    () => this.quantityError() !== null || this.extensionsError() !== null || this.marginError() !== null,
  );

  constructor() {
    this.reset();
  }

  reset(): void {
    const machine = this.config.machine();
    this.bedW.set(machine.bedWMm);
    this.bedH.set(machine.bedHMm);
    this.spacing.set(machine.spacingMm);
    this.margin.set(machine.marginMm);
    this.animationSpeed.set(machine.animationSpeed);
    this.extensions.set(machine.allowedExtensions.join(', '));
    this.maxUploadMb.set(
      Math.round((machine.maxUploadBytes / this.bytesPerMb + Number.EPSILON) * 100) / 100,
    );
    this.qtyMin.set(machine.qtyMin);
    this.qtyMax.set(machine.qtyMax);
    this.saved.set(false);
  }

  save(): void {
    if (this.invalid()) return;
    const next: MachineConfig = {
      bedWMm: this.num(this.bedW()),
      bedHMm: this.num(this.bedH()),
      spacingMm: this.num(this.spacing()),
      marginMm: this.num(this.margin()),
      animationSpeed: this.animationSpeed(),
      allowedExtensions: this.parseExtensions(),
      maxUploadBytes: Math.round(this.maxUploadMb() * this.bytesPerMb),
      qtyMin: Math.round(this.qtyMin()),
      qtyMax: Math.round(this.qtyMax()),
    };
    this.config.machineConfig.update((rows) => [next, ...rows.slice(1)]);
    this.flagSaved();
  }

  num(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  ngOnDestroy(): void {
    if (this.timer !== null) clearTimeout(this.timer);
  }

  private parseExtensions(): string[] {
    return this.extensions()
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0);
  }

  private flagSaved(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.saved.set(true);
    this.timer = setTimeout(() => this.saved.set(false), 2600);
  }
}
