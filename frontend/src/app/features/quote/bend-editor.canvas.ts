import {
  AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input,
  NgZone, OnChanges, OnDestroy, Output, ViewChild, inject,
} from '@angular/core';
import { BBox, BendLine } from '../../core/models';

interface Point { x: number; y: number; }

/**
 * Raw Canvas 2D bend editor. Drag on empty space to draw a new bend line, tap an
 * existing one to select it, drag a selected line to move it. Pointer handling
 * runs outside Angular; only committed edits re-enter the zone.
 */
@Component({
  selector: 'app-bend-editor',
  standalone: true,
  templateUrl: './bend-editor.canvas.html',
  styleUrl: './bend-editor.canvas.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BendEditorCanvas implements AfterViewInit, OnChanges, OnDestroy {
  private readonly zone = inject(NgZone);
  @ViewChild('surface', { static: true }) surfaceRef!: ElementRef<HTMLCanvasElement>;

  @Input({ required: true }) paths: number[][] = [];
  @Input({ required: true }) bbox: BBox = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  @Input({ required: true }) bends: BendLine[] = [];
  @Input() selectedId: string | null = null;

  @Output() readonly bendDrawn = new EventEmitter<{ startX: number; startY: number; endX: number; endY: number }>();
  @Output() readonly bendMoved = new EventEmitter<{ id: string; dx: number; dy: number }>();
  @Output() readonly bendPicked = new EventEmitter<string | null>();

  private ctx: CanvasRenderingContext2D | null = null;
  private observer?: ResizeObserver;
  private scale = 1;
  private offset: Point = { x: 0, y: 0 };
  private draftLine: { from: Point; to: Point } | null = null;
  private dragging: { id: string; last: Point } | null = null;

  ngAfterViewInit(): void {
    const canvas = this.surfaceRef.nativeElement;
    this.ctx = canvas.getContext('2d');
    this.zone.runOutsideAngular(() => {
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(canvas.parentElement ?? canvas);
      canvas.addEventListener('pointerdown', this.onDown);
      canvas.addEventListener('pointermove', this.onMove);
      canvas.addEventListener('pointerup', this.onUp);
      canvas.addEventListener('pointercancel', this.onUp);
    });
    this.resize();
  }

  ngOnChanges(): void {
    this.draw();
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    const canvas = this.surfaceRef?.nativeElement;
    canvas?.removeEventListener('pointerdown', this.onDown);
    canvas?.removeEventListener('pointermove', this.onMove);
    canvas?.removeEventListener('pointerup', this.onUp);
    canvas?.removeEventListener('pointercancel', this.onUp);
  }

  /** Sizes the backing store to devicePixelRatio so lines stay crisp and unclipped. */
  private resize(): void {
    const canvas = this.surfaceRef.nativeElement;
    const host = canvas.parentElement;
    if (!host || !this.ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const partW = this.bbox.maxX - this.bbox.minX || 1;
    const partH = this.bbox.maxY - this.bbox.minY || 1;
    this.scale = Math.min(w / partW, h / partH) * 0.82;
    this.offset = { x: (w - partW * this.scale) / 2, y: (h - partH * this.scale) / 2 };
    this.draw();
  }

  private toScreen(x: number, y: number): Point {
    return { x: this.offset.x + (x - this.bbox.minX) * this.scale, y: this.offset.y + (y - this.bbox.minY) * this.scale };
  }

  private toPart(px: number, py: number): Point {
    return { x: (px - this.offset.x) / this.scale + this.bbox.minX, y: (py - this.offset.y) / this.scale + this.bbox.minY };
  }

  private local(event: PointerEvent): Point {
    const rect = this.surfaceRef.nativeElement.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private hitTest(point: Point): BendLine | null {
    for (const bend of this.bends) {
      const a = this.toScreen(bend.startX, bend.startY);
      const b = this.toScreen(bend.endX, bend.endY);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq));
      if (Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy)) <= 10) return bend;
    }
    return null;
  }

  private readonly onDown = (event: PointerEvent): void => {
    const point = this.local(event);
    const hit = this.hitTest(point);
    this.surfaceRef.nativeElement.setPointerCapture(event.pointerId);
    if (hit) {
      this.dragging = { id: hit.id, last: point };
      this.zone.run(() => this.bendPicked.emit(hit.id));
    } else {
      this.draftLine = { from: point, to: point };
      this.zone.run(() => this.bendPicked.emit(null));
    }
  };

  private readonly onMove = (event: PointerEvent): void => {
    if (this.draftLine) {
      this.draftLine.to = this.local(event);
      this.draw();
    } else if (this.dragging) {
      const point = this.local(event);
      const dx = (point.x - this.dragging.last.x) / this.scale;
      const dy = (point.y - this.dragging.last.y) / this.scale;
      this.dragging.last = point;
      const id = this.dragging.id;
      this.zone.run(() => this.bendMoved.emit({ id, dx, dy }));
    }
  };

  private readonly onUp = (): void => {
    if (this.draftLine) {
      const { from, to } = this.draftLine;
      this.draftLine = null;
      if (Math.hypot(to.x - from.x, to.y - from.y) > 12) {
        const a = this.toPart(from.x, from.y);
        const b = this.toPart(to.x, to.y);
        this.zone.run(() =>
          this.bendDrawn.emit({
            startX: Math.round(a.x), startY: Math.round(a.y),
            endX: Math.round(b.x), endY: Math.round(b.y),
          }),
        );
      }
    }
    this.dragging = null;
    this.draw();
  };

  private draw(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const canvas = this.surfaceRef.nativeElement;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    const css = getComputedStyle(document.documentElement);
    const cut = css.getPropertyValue('--color-cut').trim() || '#38bdf8';
    const bendColor = css.getPropertyValue('--color-bend').trim() || '#fb923c';

    ctx.fillStyle = css.getPropertyValue('--color-bed').trim() || '#0f172a';
    ctx.fillRect(0, 0, w, h);

    // Cut geometry.
    ctx.strokeStyle = cut;
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'round';
    for (const path of this.paths) {
      ctx.beginPath();
      for (let i = 0; i < path.length; i += 2) {
        const p = this.toScreen(path[i], path[i + 1]);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }

    // Bend lines — orange dashed, thicker when selected.
    ctx.setLineDash([7, 5]);
    for (const bend of this.bends) {
      const a = this.toScreen(bend.startX, bend.startY);
      const b = this.toScreen(bend.endX, bend.endY);
      const active = bend.id === this.selectedId;
      ctx.strokeStyle = bendColor;
      ctx.lineWidth = active ? 3.5 : 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      if (active) {
        ctx.setLineDash([]);
        ctx.fillStyle = bendColor;
        for (const handle of [a, b]) {
          ctx.beginPath();
          ctx.arc(handle.x, handle.y, 5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.setLineDash([7, 5]);
      }
    }

    if (this.draftLine) {
      ctx.strokeStyle = bendColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.draftLine.from.x, this.draftLine.from.y);
      ctx.lineTo(this.draftLine.to.x, this.draftLine.to.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
}
