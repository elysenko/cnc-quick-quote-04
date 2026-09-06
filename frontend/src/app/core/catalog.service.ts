import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { Material, ShippingMethod } from './models';

/** Materials and shipping methods — `GET /api/materials` and `GET /api/shipping-methods`. */
@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly api = inject(ApiService);

  readonly materials = signal<Material[]>([]);
  readonly shippingMethods = signal<ShippingMethod[]>([]);

  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);

  private materialsLoaded = false;
  private shippingLoaded = false;

  /** Customer-facing read: the API only ever returns rows the shop has switched on. */
  async loadMaterials(force = false): Promise<void> {
    if (this.materialsLoaded && !force) return;
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.materials.set(await this.api.get<Material[]>('/materials'));
      this.materialsLoaded = true;
    } catch (error) {
      this.loadError.set((error as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  /** Admin read: includes inactive rows so the console can switch them back on. */
  async loadAllMaterials(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.materials.set(await this.api.get<Material[]>('/admin/materials'));
      this.materialsLoaded = true;
    } catch (error) {
      this.loadError.set((error as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  async loadShipping(sheets = 1, force = false): Promise<void> {
    if (this.shippingLoaded && !force) return;
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.shippingMethods.set(
        await this.api.get<ShippingMethod[]>('/shipping-methods', { sheets }),
      );
      this.shippingLoaded = true;
    } catch (error) {
      this.loadError.set((error as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  async loadAllShipping(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.shippingMethods.set(await this.api.get<ShippingMethod[]>('/admin/shipping-methods'));
      this.shippingLoaded = true;
    } catch (error) {
      this.loadError.set((error as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  activeMaterials(): Material[] {
    return this.materials().filter((m) => m.isActive);
  }

  /** Flat methods bill once; per-sheet methods bill `amountCents × sheets`. */
  activeShipping(sheets: number): ShippingMethod[] {
    return this.shippingMethods()
      .filter((m) => m.isActive)
      .map((m) => ({
        ...m,
        computedCents:
          m.rateType === 'PER_SHEET' ? m.amountCents * Math.max(1, sheets) : m.amountCents,
      }));
  }

  // --- Admin writes --------------------------------------------------------

  async createMaterial(body: Omit<Material, 'id'>): Promise<void> {
    await this.api.post('/admin/materials', body);
    await this.loadAllMaterials();
  }

  async updateMaterial(id: string, body: Omit<Material, 'id'>): Promise<void> {
    await this.api.put(`/admin/materials/${id}`, body);
    await this.loadAllMaterials();
  }

  async deleteMaterial(id: string): Promise<void> {
    await this.api.delete(`/admin/materials/${id}`);
    await this.loadAllMaterials();
  }

  async createShippingMethod(body: ShippingWrite): Promise<void> {
    await this.api.post('/admin/shipping-methods', body);
    await this.loadAllShipping();
  }

  async updateShippingMethod(id: string, body: ShippingWrite): Promise<void> {
    await this.api.put(`/admin/shipping-methods/${id}`, body);
    await this.loadAllShipping();
  }

  async deleteShippingMethod(id: string): Promise<void> {
    await this.api.delete(`/admin/shipping-methods/${id}`);
    await this.loadAllShipping();
  }
}

export interface ShippingWrite {
  name: string;
  rateType: 'FLAT' | 'PER_SHEET';
  amountCents: number;
  estDeliveryDays: number;
  isActive: boolean;
}
