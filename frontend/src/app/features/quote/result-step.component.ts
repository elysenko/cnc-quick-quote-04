import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ConfigService } from '../../core/config.service';
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
  private readonly config = inject(ConfigService);
  readonly draft = inject(QuoteDraftService);

  readonly sheetIndex = signal(0);
  readonly submitting = signal(false);
  readonly submitError = signal<string | null>(null);

  readonly machine = computed(() => this.config.machine());
  readonly sheets = computed(() => {
    const count = this.draft.nesting()?.sheets ?? 0;
    return Array.from({ length: count }, (_, i) => i);
  });

  /** Writes the draft as a real quote, then hands off to checkout on its reference. */
  async proceed(): Promise<void> {
    if (this.submitting()) return;
    this.submitting.set(true);
    this.submitError.set(null);
    try {
      const quote = await this.draft.createQuote();
      if (!quote) {
        this.submitError.set('Complete the earlier steps before continuing.');
        return;
      }
      await this.router.navigate(['/checkout', quote.id, 'review']);
    } catch (error) {
      this.submitError.set((error as Error).message);
    } finally {
      this.submitting.set(false);
    }
  }
}
