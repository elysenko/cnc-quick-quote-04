import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ConfigService } from '../../core/config.service';
import { OrdersService } from '../../core/orders.service';
import { MoneyPipe } from '../../shared/money.pipe';
import { QuoteDraftService } from './quote-draft.service';
import { WorkbedCanvas } from './workbed/workbed.canvas';

@Component({
  selector: 'app-result-step',
  standalone: true,
  imports: [MoneyPipe, WorkbedCanvas],
  templateUrl: './result-step.component.html',
  styleUrl: './result-step.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultStepComponent {
  private readonly router = inject(Router);
  private readonly orders = inject(OrdersService);
  private readonly config = inject(ConfigService);
  readonly draft = inject(QuoteDraftService);

  readonly sheetIndex = signal(0);
  readonly machine = computed(() => this.config.machine());
  readonly sheets = computed(() => {
    const count = this.draft.nesting()?.sheets ?? 0;
    return Array.from({ length: count }, (_, i) => i);
  });

  /** Snapshots the draft as a quote, then hands off to checkout. */
  proceed(): void {
    const draft = this.draft;
    const material = draft.material();
    const nesting = draft.nesting();
    const drawing = draft.drawing();
    const result = draft.priceResult();
    if (!material || !nesting || !drawing || !result) return;

    const id = `QT-2026-${String(500 + this.orders.quotes().length).padStart(4, '0')}`;
    this.orders.quotes.update((list) => [
      {
        id,
        drawingId: drawing.id,
        drawingName: drawing.filename,
        materialId: material.id,
        materialName: material.name,
        quantity: draft.quantity(),
        cutLengthMm: drawing.cutLengthMm,
        bendCount: draft.bends().length,
        breakdown: result.lines,
        nesting,
        totalCents: result.totalCents,
        createdAt: new Date().toISOString(),
      },
      ...list,
    ]);
    void this.router.navigate(['/checkout', id, 'review']);
  }
}
