import { Injectable, signal } from '@angular/core';
import { Material, ShippingMethod } from './models';

/** Materials and shipping methods — `materials.list` and `shippingMethods.list`. */
@Injectable({ providedIn: 'root' })
export class CatalogService {
  readonly materials = signal<Material[]>([
    { id: 'mat_ms16', name: 'Mild steel 1.6 mm', thicknessMm: 1.6, sheetWMm: 1250, sheetHMm: 2500, costMultiplier: 1, isActive: true },
    { id: 'mat_ms30', name: 'Mild steel 3.0 mm', thicknessMm: 3, sheetWMm: 1250, sheetHMm: 2500, costMultiplier: 1.45, isActive: true },
    { id: 'mat_ss20', name: 'Stainless 304, 2.0 mm', thicknessMm: 2, sheetWMm: 1000, sheetHMm: 2000, costMultiplier: 2.35, isActive: true },
    { id: 'mat_al30', name: 'Aluminium 5052, 3.0 mm', thicknessMm: 3, sheetWMm: 1250, sheetHMm: 2500, costMultiplier: 1.9, isActive: true },
    { id: 'mat_br15', name: 'Brass C260, 1.5 mm', thicknessMm: 1.5, sheetWMm: 900, sheetHMm: 1800, costMultiplier: 3.1, isActive: false },
  ]);

  readonly shippingMethods = signal<ShippingMethod[]>([
    { id: 'shp_std', name: 'Standard freight', rateType: 'FLAT', amountCents: 2400, computedCents: 2400, estDeliveryDays: 6, isActive: true },
    { id: 'shp_exp', name: 'Express courier', rateType: 'FLAT', amountCents: 5900, computedCents: 5900, estDeliveryDays: 2, isActive: true },
    { id: 'shp_pal', name: 'Palletised, per sheet', rateType: 'PER_SHEET', amountCents: 1850, computedCents: 1850, estDeliveryDays: 4, isActive: true },
    { id: 'shp_pick', name: 'Collect from workshop', rateType: 'FLAT', amountCents: 0, computedCents: 0, estDeliveryDays: 1, isActive: false },
  ]);

  activeMaterials(): Material[] {
    return this.materials().filter((m) => m.isActive);
  }

  /** Flat methods bill once; per-sheet methods bill `amountCents × sheets`. */
  activeShipping(sheets: number): ShippingMethod[] {
    return this.shippingMethods()
      .filter((m) => m.isActive)
      .map((m) => ({
        ...m,
        computedCents: m.rateType === 'PER_SHEET' ? m.amountCents * Math.max(1, sheets) : m.amountCents,
      }));
  }
}
