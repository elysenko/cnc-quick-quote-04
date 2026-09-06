import { Injectable, computed, inject, signal } from '@angular/core';
import { BendLine, Drawing, Nesting } from '../../core/models';
import { CatalogService } from '../../core/catalog.service';
import { ConfigService } from '../../core/config.service';
import { PART_BBOX, PART_CUT_LENGTH_MM, PART_H_MM, PART_PATHS, PART_W_MM } from './sample-geometry';
import { PriceResult, nest, price } from './quote-math';

export type UploadState = 'idle' | 'parsing' | 'ready' | 'error';

/**
 * Wizard state shared across the `/quote/new/*` child routes. The drawing, bend
 * and quote records are the API-backed collections; the selections beside them
 * are pure UI state that lives only for the length of the wizard.
 */
@Injectable({ providedIn: 'root' })
export class QuoteDraftService {
  private readonly catalog = inject(CatalogService);
  private readonly config = inject(ConfigService);

  readonly drawings = signal<Drawing[]>([
    {
      id: 'dwg_8241',
      filename: 'mount-bracket-rev-c.dxf',
      sizeBytes: 48_112,
      bbox: PART_BBOX,
      cutLengthMm: PART_CUT_LENGTH_MM,
      entityCount: 6,
      createdAt: '2026-09-05T14:08:00.000Z',
      paths: PART_PATHS,
    },
  ]);

  readonly bends = signal<BendLine[]>([
    { id: 'bnd_1', drawingId: 'dwg_8241', startX: 46, startY: 0, endX: 46, endY: PART_H_MM, angleDeg: 90, direction: 'UP' },
    { id: 'bnd_2', drawingId: 'dwg_8241', startX: 134, startY: 0, endX: 134, endY: PART_H_MM, angleDeg: 45, direction: 'DOWN' },
  ]);

  readonly uploadState = signal<UploadState>('ready');
  readonly uploadError = signal<string | null>(null);
  readonly uploadProgress = signal(100);
  readonly materialId = signal<string | null>('mat_ms30');
  readonly quantity = signal(24);
  readonly selectedBendId = signal<string | null>(null);

  readonly drawing = computed<Drawing | null>(() => this.drawings().at(0) ?? null);
  readonly hasDrawing = computed(() => this.drawing() !== null && this.uploadState() === 'ready');

  readonly material = computed(() => {
    const id = this.materialId();
    return this.catalog.materials().find((m) => m.id === id && m.isActive) ?? null;
  });

  readonly partWidthMm = computed(() => {
    const b = this.drawing()?.bbox;
    return b ? b.maxX - b.minX : PART_W_MM;
  });
  readonly partHeightMm = computed(() => {
    const b = this.drawing()?.bbox;
    return b ? b.maxY - b.minY : PART_H_MM;
  });

  /** Null when the part does not fit the sheet — the quote is rejected before it is created. */
  readonly nesting = computed<Nesting | null>(() => {
    const material = this.material();
    if (!material) return null;
    return nest(this.partWidthMm(), this.partHeightMm(), this.quantity(), material, this.config.machine());
  });

  readonly priceResult = computed<PriceResult | null>(() => {
    const material = this.material();
    const nesting = this.nesting();
    const drawing = this.drawing();
    if (!material || !nesting || !drawing) return null;
    return price(drawing.cutLengthMm, this.quantity(), this.bends().length, nesting, material, this.config.pricing());
  });

  readonly quantityValid = computed(() => {
    const { qtyMin, qtyMax } = this.config.machine();
    const qty = this.quantity();
    return Number.isInteger(qty) && qty >= qtyMin && qty <= qtyMax;
  });

  readonly materialComplete = computed(() => this.material() !== null && this.quantityValid());

  addBend(bend: BendLine): void {
    this.bends.update((list) => [...list, bend]);
  }

  updateBend(id: string, patch: Partial<BendLine>): void {
    this.bends.update((list) => list.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  removeBend(id: string): void {
    this.bends.update((list) => list.filter((b) => b.id !== id));
    if (this.selectedBendId() === id) this.selectedBendId.set(null);
  }
}
