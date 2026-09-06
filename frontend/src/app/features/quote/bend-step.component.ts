import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { BendDirection } from '../../core/models';
import { BendEditorCanvas } from './bend-editor.canvas';
import { QuoteDraftService } from './quote-draft.service';

/**
 * Every edit round-trips to `/api/drawings/:id/bends`; the stored DXF object is
 * never touched, and the persisted bend list is what the next price is built from.
 */
@Component({
  selector: 'app-bend-step',
  standalone: true,
  imports: [BendEditorCanvas],
  templateUrl: './bend-step.component.html',
  styleUrl: './bend-step.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BendStepComponent {
  readonly draft = inject(QuoteDraftService);

  readonly selected = computed(() => {
    const id = this.draft.selectedBendId();
    return this.draft.bends().find((b) => b.id === id) ?? null;
  });

  onDrawn(line: { startX: number; startY: number; endX: number; endY: number }): void {
    void this.draft.addBend({ ...line, angleDeg: 90, direction: 'UP' });
  }

  onMoved(move: { id: string; dx: number; dy: number }): void {
    const bend = this.draft.bends().find((b) => b.id === move.id);
    if (!bend) return;
    void this.draft.updateBend(move.id, {
      startX: Math.round(bend.startX + move.dx),
      startY: Math.round(bend.startY + move.dy),
      endX: Math.round(bend.endX + move.dx),
      endY: Math.round(bend.endY + move.dy),
    });
  }

  setAngle(value: string): void {
    const id = this.draft.selectedBendId();
    const parsed = Number.parseInt(value, 10);
    if (!id || Number.isNaN(parsed)) return;
    void this.draft.updateBend(id, { angleDeg: Math.max(0, Math.min(180, parsed)) });
  }

  setDirection(direction: BendDirection): void {
    const id = this.draft.selectedBendId();
    if (id) void this.draft.updateBend(id, { direction });
  }

  /** Rotates the selected bend about its midpoint. */
  rotate(degrees: number): void {
    const bend = this.selected();
    if (!bend) return;
    const cx = (bend.startX + bend.endX) / 2;
    const cy = (bend.startY + bend.endY) / 2;
    const rad = (degrees * Math.PI) / 180;
    const spin = (x: number, y: number) => ({
      x: Math.round(cx + (x - cx) * Math.cos(rad) - (y - cy) * Math.sin(rad)),
      y: Math.round(cy + (x - cx) * Math.sin(rad) + (y - cy) * Math.cos(rad)),
    });
    const a = spin(bend.startX, bend.startY);
    const b = spin(bend.endX, bend.endY);
    void this.draft.updateBend(bend.id, {
      startX: a.x,
      startY: a.y,
      endX: b.x,
      endY: b.y,
    });
  }

  remove(id: string): void {
    void this.draft.removeBend(id);
  }
}
