import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ConfigService } from '../../core/config.service';
import { QuoteDraftService } from './quote-draft.service';

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
  readonly maxUploadMb = computed(() =>
    Math.max(1, Math.round(this.machine().maxUploadBytes / (1024 * 1024))),
  );
  readonly acceptList = computed(() => this.machine().allowedExtensions.join(', '));

  constructor() {
    void this.config.load();
  }

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
    if (file) void this.accept(file);
  }

  onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Reset so re-picking the same file after a failure still fires a change event.
    input.value = '';
    if (file) void this.accept(file);
  }

  /**
   * Checks the obvious client-side rules first for instant feedback, then hands the
   * file to the API — which re-runs every one of them and owns the real verdict.
   */
  private async accept(file: File): Promise<void> {
    const machine = this.machine();
    const dot = file.name.lastIndexOf('.');
    const ext = dot === -1 ? '' : file.name.slice(dot).toLowerCase();

    if (machine.allowedExtensions.length > 0 && !machine.allowedExtensions.includes(ext)) {
      this.fail(`“${file.name}” is not a supported drawing. Accepted formats: ${this.acceptList()}.`);
      return;
    }
    if (machine.maxUploadBytes > 0 && file.size > machine.maxUploadBytes) {
      this.fail(
        `“${file.name}” is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is ${this.maxUploadMb()} MB.`,
      );
      return;
    }

    await this.draft.uploadDrawing(file);
  }

  private fail(reason: string): void {
    this.draft.uploadError.set(reason);
    this.draft.uploadState.set('error');
    this.draft.uploadProgress.set(0);
  }

  clear(): void {
    this.draft.clearDrawing();
  }
}
