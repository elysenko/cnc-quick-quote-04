import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { BendLine, BreakdownLine, Drawing, Nesting } from '../../core/models';
import { CatalogService } from '../../core/catalog.service';
import { ConfigService } from '../../core/config.service';
import { OrdersService } from '../../core/orders.service';
import { Quote } from '../../core/models';

export type UploadState = 'idle' | 'parsing' | 'ready' | 'error';

export interface PriceResult {
  lines: BreakdownLine[];
  totalCents: number;
}

interface PreviewResponse {
  nesting: Nesting;
  breakdown: BreakdownLine[];
  totalCents: number;
  bendCount: number;
}

/**
 * Wizard state shared across the `/quote/new/*` child routes.
 *
 * The drawing, its bend lines, the nest and the price all come from the API: the
 * server is the only thing that parses geometry or prices work, so the number on
 * screen is the number the quote is written with.
 */
@Injectable({ providedIn: 'root' })
export class QuoteDraftService {
  private readonly api = inject(ApiService);
  private readonly catalog = inject(CatalogService);
  private readonly config = inject(ConfigService);
  private readonly orders = inject(OrdersService);

  readonly drawings = signal<Drawing[]>([]);
  readonly bends = signal<BendLine[]>([]);

  readonly uploadState = signal<UploadState>('idle');
  readonly uploadError = signal<string | null>(null);
  readonly uploadProgress = signal(0);
  readonly materialId = signal<string | null>(null);
  readonly quantity = signal(1);
  readonly selectedBendId = signal<string | null>(null);

  /** Populated by the server-side nest/price preview; null until it resolves. */
  readonly nesting = signal<Nesting | null>(null);
  readonly priceResult = signal<PriceResult | null>(null);
  readonly pricing = signal(false);
  readonly priceError = signal<string | null>(null);

  readonly drawing = computed<Drawing | null>(() => this.drawings().at(0) ?? null);
  readonly hasDrawing = computed(
    () => this.drawing() !== null && this.uploadState() === 'ready',
  );

  readonly material = computed(() => {
    const id = this.materialId();
    return this.catalog.materials().find((m) => m.id === id && m.isActive) ?? null;
  });

  readonly partWidthMm = computed(() => {
    const b = this.drawing()?.bbox;
    return b ? Math.round((b.maxX - b.minX) * 10) / 10 : 0;
  });
  readonly partHeightMm = computed(() => {
    const b = this.drawing()?.bbox;
    return b ? Math.round((b.maxY - b.minY) * 10) / 10 : 0;
  });

  readonly quantityValid = computed(() => {
    const { qtyMin, qtyMax } = this.config.machine();
    const qty = this.quantity();
    return Number.isInteger(qty) && qty >= qtyMin && qty <= qtyMax;
  });

  readonly materialComplete = computed(
    () => this.material() !== null && this.quantityValid(),
  );

  constructor() {
    // Re-prices whenever any pricing input changes. The request is debounced by the
    // token check below, so a burst of keystrokes only ever applies the last result.
    effect(() => {
      const drawingId = this.drawing()?.id ?? null;
      const materialId = this.materialId();
      const quantity = this.quantity();
      const bendCount = this.bends().length;
      void bendCount;
      void this.refreshPreview(drawingId, materialId, quantity);
    });
  }

  private previewToken = 0;

  /** Asks the API for the nest and the itemised price of the current draft. */
  private async refreshPreview(
    drawingId: string | null,
    materialId: string | null,
    quantity: number,
  ): Promise<void> {
    if (!drawingId || !materialId || !this.quantityValid()) {
      this.nesting.set(null);
      this.priceResult.set(null);
      this.priceError.set(null);
      return;
    }

    const token = ++this.previewToken;
    this.pricing.set(true);
    this.priceError.set(null);
    try {
      const result = await this.api.post<PreviewResponse>('/quotes/preview', {
        drawingId,
        materialId,
        quantity,
      });
      if (token !== this.previewToken) return;
      this.nesting.set(result.nesting);
      this.priceResult.set({ lines: result.breakdown, totalCents: result.totalCents });
    } catch (error) {
      if (token !== this.previewToken) return;
      this.nesting.set(null);
      this.priceResult.set(null);
      this.priceError.set((error as Error).message);
    } finally {
      if (token === this.previewToken) this.pricing.set(false);
    }
  }

  /** Uploads and parses a drawing. The server owns every validation rule. */
  async uploadDrawing(file: File): Promise<void> {
    this.uploadError.set(null);
    this.uploadProgress.set(15);
    this.uploadState.set('parsing');
    try {
      const drawing = await this.api.upload<Drawing>('/drawings', 'file', file);
      this.uploadProgress.set(100);
      this.drawings.set([drawing]);
      this.bends.set([]);
      this.selectedBendId.set(null);
      this.uploadState.set('ready');
    } catch (error) {
      this.uploadError.set((error as Error).message);
      this.uploadState.set('error');
      this.uploadProgress.set(0);
      this.drawings.set([]);
    }
  }

  clearDrawing(): void {
    this.drawings.set([]);
    this.bends.set([]);
    this.selectedBendId.set(null);
    this.uploadError.set(null);
    this.uploadState.set('idle');
    this.uploadProgress.set(0);
  }

  // --- Bend lines ----------------------------------------------------------

  async addBend(line: {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    angleDeg?: number;
    direction?: BendLine['direction'];
  }): Promise<void> {
    const drawing = this.drawing();
    if (!drawing) return;
    const created = await this.api.post<BendLine>(`/drawings/${drawing.id}/bends`, {
      startX: line.startX,
      startY: line.startY,
      endX: line.endX,
      endY: line.endY,
      angleDeg: line.angleDeg ?? 90,
      direction: line.direction ?? 'UP',
    });
    this.bends.update((list) => [...list, created]);
    this.selectedBendId.set(created.id);
  }

  async updateBend(id: string, patch: Partial<BendLine>): Promise<void> {
    const drawing = this.drawing();
    if (!drawing) return;
    // Applied locally first so dragging stays smooth, then confirmed by the server.
    this.bends.update((list) => list.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    const saved = await this.api.patch<BendLine>(`/drawings/${drawing.id}/bends/${id}`, patch);
    this.bends.update((list) => list.map((b) => (b.id === id ? saved : b)));
  }

  async removeBend(id: string): Promise<void> {
    const drawing = this.drawing();
    if (!drawing) return;
    await this.api.delete(`/drawings/${drawing.id}/bends/${id}`);
    this.bends.update((list) => list.filter((b) => b.id !== id));
    if (this.selectedBendId() === id) this.selectedBendId.set(null);
  }

  /** Writes the draft as a real quote and returns it, ready for checkout. */
  async createQuote(): Promise<Quote | null> {
    const drawing = this.drawing();
    const materialId = this.materialId();
    if (!drawing || !materialId) return null;
    const quote = await this.api.post<Quote>('/quotes', {
      drawingId: drawing.id,
      materialId,
      quantity: this.quantity(),
    });
    this.orders.addQuote(quote);
    return quote;
  }
}
