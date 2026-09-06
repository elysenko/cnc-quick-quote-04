import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { QuoteDraftService } from './quote-draft.service';

interface Step { key: string; label: string; route: string; }

@Component({
  selector: 'app-quote-wizard',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './quote-wizard.component.html',
  styleUrl: './quote-wizard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuoteWizardComponent {
  private readonly router = inject(Router);
  readonly draft = inject(QuoteDraftService);

  readonly steps: Step[] = [
    { key: 'upload', label: 'Drawing', route: '/quote/new/upload' },
    { key: 'material', label: 'Material', route: '/quote/new/material' },
    { key: 'bends', label: 'Bends', route: '/quote/new/bends' },
    { key: 'result', label: 'Quote', route: '/quote/new/result' },
  ];

  private readonly url = signal(this.router.url);

  readonly activeIndex = computed(() => {
    const current = this.url();
    const found = this.steps.findIndex((s) => current.startsWith(s.route));
    return found === -1 ? 0 : found;
  });

  /** Forward navigation is blocked until the current step has what it needs. */
  readonly canAdvance = computed(() => {
    switch (this.activeIndex()) {
      case 0: return this.draft.hasDrawing();
      case 1: return this.draft.materialComplete();
      case 2: return this.draft.nesting() !== null;
      default: return false;
    }
  });

  readonly blockedReason = computed(() => {
    switch (this.activeIndex()) {
      case 0: return 'Upload a drawing to continue.';
      case 1: return 'Choose an active material and a valid quantity to continue.';
      case 2: return 'This part does not fit the selected sheet.';
      default: return '';
    }
  });

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.url.set(e.urlAfterRedirects));
  }

  /** Completed steps stay clickable so a reviewer can jump back to any of them. */
  reachable(index: number): boolean {
    if (index === 0) return true;
    if (index === 1) return this.draft.hasDrawing();
    return this.draft.hasDrawing() && this.draft.materialComplete();
  }

  go(index: number): void {
    const step = this.steps[index];
    if (step && this.reachable(index)) void this.router.navigateByUrl(step.route);
  }

  next(): void {
    if (this.canAdvance()) this.go(this.activeIndex() + 1);
  }

  back(): void {
    this.go(this.activeIndex() - 1);
  }
}
