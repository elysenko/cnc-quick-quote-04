import {
  AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, Input, NgZone,
  OnChanges, OnDestroy, ViewChild, inject, signal,
} from '@angular/core';
import { BBox, BendLine, MachineConfig, Material, Nesting } from '../../../core/models';
import { CutSegment, LaserAnimation, pointAt, segmentsFrom, totalLength } from './laser-animation';

/**
 * Machine bed, sheet outline, nested parts, cut paths and bend lines. The static
 * scene is rendered once to an offscreen layer; each animation frame only stamps
 * the newly-cut span onto a progress layer and redraws the head.
 */
@Component({
  selector: 'app-workbed',
  standalone: true,
  templateUrl: './workbed.canvas.html',
  styleUrl: './workbed.canvas.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkbedCanvas implements AfterViewInit, OnChanges, OnDestroy {
  private readonly zone = inject(NgZone);
  @ViewChild('stage', { static: true }) stageRef!: ElementRef<HTMLCanvasElement>;

  @Input({ required: true }) paths: number[][] = [];
  @Input({ required: true }) bbox!: BBox;
  @Input({ required: true }) nesting!: Nesting;
  @Input({ required: true }) material!: Material;
  @Input({ required: true }) machine!: MachineConfig;
  @Input() bends: BendLine[] = [];
  @Input() sheetIndex = 0;

  readonly running = signal(false);

  private ctx: CanvasRenderingContext2D | null = null;
  private staticLayer = document.createElement('canvas');
  private progressLayer = document.createElement('canvas');
  private observer?: ResizeObserver;
  private segments: CutSegment[] = [];
  private scale = 1;
  private origin = { x: 0, y: 0 };
  private laser = new LaserAnimation(
    (from, to) => this.onFrame(from, to),
    () => this.zone.run(() => this.running.set(this.laser.running)),
  );

  ngAfterViewInit(): void {
    this.ctx = this.stageRef.nativeElement.getContext('2d');
    this.zone.runOutsideAngular(() => {
      this.observer = new ResizeObserver(() => this.rebuild());
      this.observer.observe(this.stageRef.nativeElement.parentElement ?? this.stageRef.nativeElement);
    });
    this.rebuild();
    // The bed starts cutting on load; the Print Bed button stops and resets it.
    this.zone.runOutsideAngular(() => this.laser.start());
  }

  ngOnChanges(): void {
    if (this.ctx) this.rebuild();
  }

  ngOnDestroy(): void {
    this.laser.destroy();
    this.observer?.disconnect();
  }

  togglePrint(): void {
    this.zone.runOutsideAngular(() => this.laser.toggle());
  }

  private sheetPlacements() {
    return this.nesting.placements.filter((p) => p.sheet === this.sheetIndex);
  }

  /** Recomputes layout, redraws the static layer and rebuilds the cut path. */
  private rebuild(): void {
    const canvas = this.stageRef.nativeElement;
    const host = canvas.parentElement;
    if (!this.ctx || !host || !this.material) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    for (const layer of [canvas, this.staticLayer, this.progressLayer]) {
      layer.width = Math.round(w * dpr);
      layer.height = Math.round(h * dpr);
    }
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    for (const layer of [canvas, this.staticLayer, this.progressLayer]) {
      layer.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const bedW = this.machine.bedWMm;
    const bedH = this.machine.bedHMm;
    this.scale = Math.min(w / bedW, h / bedH) * 0.9;
    this.origin = { x: (w - bedW * this.scale) / 2, y: (h - bedH * this.scale) / 2 };

    this.drawStatic(w, h);
    this.buildSegments();
    this.laser.total = totalLength(this.segments);
    this.laser.speed = 200 * (this.machine.animationSpeed || 1);
    this.composite();
  }

  private px(x: number, y: number): { x: number; y: number } {
    return { x: this.origin.x + x * this.scale, y: this.origin.y + y * this.scale };
  }

  private buildSegments(): void {
    this.segments = [];
    for (const place of this.sheetPlacements()) {
      const shifted = this.paths.map((path) => {
        const out = new Array<number>(path.length);
        for (let i = 0; i < path.length; i += 2) {
          const p = this.px(place.x + path[i] - this.bbox.minX, place.y + path[i + 1] - this.bbox.minY);
          out[i] = p.x;
          out[i + 1] = p.y;
        }
        return out;
      });
      this.segments.push(...segmentsFrom(shifted));
    }
  }

  private token(name: string, fallback: string): string {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  private drawStatic(w: number, h: number): void {
    const ctx = this.staticLayer.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = this.token('--color-bed', '#0f172a');
    ctx.fillRect(0, 0, w, h);

    const bed = { ...this.px(0, 0), w: this.machine.bedWMm * this.scale, h: this.machine.bedHMm * this.scale };

    // Bed plate and 100 mm reference grid.
    ctx.fillStyle = this.token('--color-bed-alt', '#16213a');
    ctx.fillRect(bed.x, bed.y, bed.w, bed.h);
    ctx.strokeStyle = this.token('--color-bed-grid', '#24334f');
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= this.machine.bedWMm; x += 100) {
      const p = this.px(x, 0);
      ctx.moveTo(p.x, bed.y);
      ctx.lineTo(p.x, bed.y + bed.h);
    }
    for (let y = 0; y <= this.machine.bedHMm; y += 100) {
      const p = this.px(0, y);
      ctx.moveTo(bed.x, p.y);
      ctx.lineTo(bed.x + bed.w, p.y);
    }
    ctx.stroke();

    // Sheet outline.
    const sheet = this.px(0, 0);
    ctx.strokeStyle = '#7f8fab';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(sheet.x, sheet.y, this.material.sheetWMm * this.scale, this.material.sheetHMm * this.scale);

    // Uncut geometry, dimmed — the progress layer paints over it as the head passes.
    ctx.strokeStyle = 'rgba(56, 189, 248, .32)';
    ctx.lineWidth = 1.2;
    const partOrigin = { x: this.bbox.minX, y: this.bbox.minY };
    for (const place of this.sheetPlacements()) {
      for (const path of this.paths) {
        ctx.beginPath();
        for (let i = 0; i < path.length; i += 2) {
          const p = this.px(place.x + path[i] - partOrigin.x, place.y + path[i + 1] - partOrigin.y);
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }

      // Bend lines — orange dashed.
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = this.token('--color-bend', '#fb923c');
      ctx.lineWidth = 1.6;
      for (const bend of this.bends) {
        const a = this.px(place.x + bend.startX - partOrigin.x, place.y + bend.startY - partOrigin.y);
        const b = this.px(place.x + bend.endX - partOrigin.x, place.y + bend.endY - partOrigin.y);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(56, 189, 248, .32)';
      ctx.lineWidth = 1.2;
    }

    // Labels.
    ctx.fillStyle = '#93a4c1';
    ctx.font = '600 11px ui-monospace, monospace';
    ctx.fillText(`BED ${this.machine.bedWMm} × ${this.machine.bedHMm} mm`, bed.x, Math.max(12, bed.y - 8));
    const count = this.sheetPlacements().length;
    ctx.fillText(
      `SHEET ${this.sheetIndex + 1}/${this.nesting.sheets} · ${count} part(s) · ${this.material.name}`,
      bed.x,
      bed.y + bed.h + 16,
    );
  }

  /** Stamps the span cut during this frame onto the progress layer. */
  private onFrame(from: number, to: number): void {
    const ctx = this.progressLayer.getContext('2d');
    if (!ctx) return;
    if (to <= from) {
      ctx.clearRect(0, 0, this.progressLayer.width, this.progressLayer.height);
      this.composite();
      return;
    }
    ctx.strokeStyle = this.token('--color-cut', '#38bdf8');
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    let walked = 0;
    for (const s of this.segments) {
      const segStart = walked;
      const segEnd = walked + s.length;
      walked = segEnd;
      if (segEnd < from) continue;
      if (segStart > to) break;
      const t0 = Math.max(0, (from - segStart) / s.length);
      const t1 = Math.min(1, (to - segStart) / s.length);
      ctx.beginPath();
      ctx.moveTo(s.x1 + (s.x2 - s.x1) * t0, s.y1 + (s.y2 - s.y1) * t0);
      ctx.lineTo(s.x1 + (s.x2 - s.x1) * t1, s.y1 + (s.y2 - s.y1) * t1);
      ctx.stroke();
    }
    this.composite();
  }

  private composite(): void {
    const ctx = this.ctx;
    const canvas = this.stageRef.nativeElement;
    if (!ctx) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.staticLayer, 0, 0, w, h);
    ctx.drawImage(this.progressLayer, 0, 0, w, h);

    const head = this.laser.running ? pointAt(this.segments, this.laser.distance) : null;
    if (!head) return;
    const glow = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, 14);
    glow.addColorStop(0, 'rgba(255, 236, 190, .95)');
    glow.addColorStop(1, 'rgba(249, 115, 22, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(head.x, head.y, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff7ed';
    ctx.beginPath();
    ctx.arc(head.x, head.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}
