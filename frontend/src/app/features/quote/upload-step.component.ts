import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ConfigService } from '../../core/config.service';
import { QuoteDraftService } from './quote-draft.service';
import { PART_BBOX, PART_CUT_LENGTH_MM, PART_PATHS } from './sample-geometry';

@Component({
  selector: 'app-upload-step',
  standalone: true,
  templateUrl: './upload-step.component.html',
  styleUrl: './upload-step.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UploadStepComponent {
  private readonly config = inject(ConfigService);
  readonly draft = inject(QuoteDraftService);

  readonly dragging = signal(false);

  readonly machine = computed(() => this.config.machine());
  readonly maxUploadMb = computed(() => Math.round(this.machine().maxUploadBytes / (1024 * 1024)));
  readonly acceptList = computed(() => this.machine().allowedExtensions.join(', '));

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  onDragLeave(): void {
    this.dragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) this.accept(file);
  }

  onPick(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.accept(file);
  }

  /**
   * Mirrors the server's validation order — extension, then size, then parse —
   * so the customer sees the same 422 reason the API would return.
   */
  private accept(file: File): void {
    const machine = this.machine();
    const dot = file.name.lastIndexOf('.');
    const ext = dot === -1 ? '' : file.name.slice(dot).toLowerCase();

    if (!machine.allowedExtensions.includes(ext)) {
      this.fail(`“${file.name}” is not a supported drawing. Accepted formats: ${this.acceptList()}.`);
      return;
    }
    if (file.size > machine.maxUploadBytes) {
      this.fail(`“${file.name}” is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is ${this.maxUploadMb()} MB.`);
      return;
    }

    this.draft.uploadError.set(null);
    this.draft.uploadProgress.set(0);
    this.draft.uploadState.set('parsing');

    const tick = setInterval(() => {
      this.draft.uploadProgress.update((p) => Math.min(100, p + 20));
      if (this.draft.uploadProgress() >= 100) {
        clearInterval(tick);
        this.draft.drawings.set([
          {
            id: 'dwg_' + Math.floor(performance.now()).toString(36),
            filename: file.name,
            sizeBytes: file.size,
            bbox: PART_BBOX,
            cutLengthMm: PART_CUT_LENGTH_MM,
            entityCount: 6,
            createdAt: new Date().toISOString(),
            paths: PART_PATHS,
          },
        ]);
        this.draft.bends.set([]);
        this.draft.uploadState.set('ready');
      }
    }, 160);
  }

  private fail(reason: string): void {
    this.draft.uploadError.set(reason);
    this.draft.uploadState.set('error');
    this.draft.uploadProgress.set(0);
  }

  clear(): void {
    this.draft.drawings.set([]);
    this.draft.bends.set([]);
    this.draft.uploadError.set(null);
    this.draft.uploadState.set('idle');
  }
}
