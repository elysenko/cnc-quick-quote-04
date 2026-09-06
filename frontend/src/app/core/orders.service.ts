import { Injectable, signal } from '@angular/core';
import { Order, Quote } from './models';
import { PART_CUT_LENGTH_MM } from '../features/quote/sample-geometry';

function nesting(cols: number, rows: number, sheets: number, quantity: number, utilization: number) {
  const perSheet = cols * rows;
  const placements = Array.from({ length: quantity }, (_, i) => ({
    x: 12 + (i % perSheet % cols) * 188,
    y: 12 + Math.floor((i % perSheet) / cols) * 128,
    sheet: Math.floor(i / perSheet),
  }));
  return { cols, rows, perSheet, sheets, utilization, placements };
}

/** `quotes.list` / `quotes.getById` and `orders.list` / `orders.getById`. */
@Injectable({ providedIn: 'root' })
export class OrdersService {
  readonly quotes = signal<Quote[]>([
    {
      id: 'QT-2026-0431', drawingId: 'dwg_8241', drawingName: 'mount-bracket-rev-c.dxf',
      materialId: 'mat_ms30', materialName: 'Mild steel 3.0 mm', quantity: 24,
      cutLengthMm: PART_CUT_LENGTH_MM, bendCount: 2,
      breakdown: [
        { label: 'Setup', detail: 'One-off machine setup', amountCents: 3500 },
        { label: 'Cutting', detail: '69.75 linear ft @ 2.85/ft', amountCents: 19878 },
        { label: 'Material', detail: '1 × Mild steel 3.0 mm sheet @ 1.45× multiplier', amountCents: 19031 },
        { label: 'Bending', detail: '2 bend(s) × 24 part(s)', amountCents: 6720 },
        { label: 'Handling', detail: 'Deburr, pack and label', amountCents: 1200 },
      ],
      nesting: nesting(6, 24, 1, 24, 0.632), totalCents: 50329, createdAt: '2026-09-05T14:11:00.000Z',
    },
    {
      id: 'QT-2026-0418', drawingId: 'dwg_8190', drawingName: 'gusset-plate-v2.dxf',
      materialId: 'mat_ss20', materialName: 'Stainless 304, 2.0 mm', quantity: 120,
      cutLengthMm: 412.6, bendCount: 0,
      breakdown: [
        { label: 'Setup', detail: 'One-off machine setup', amountCents: 3500 },
        { label: 'Cutting', detail: '162.44 linear ft @ 2.85/ft', amountCents: 46295 },
        { label: 'Material', detail: '3 × Stainless 304, 2.0 mm sheet @ 2.35× multiplier', amountCents: 59220 },
        { label: 'Bending', detail: '0 bend(s) × 120 part(s)', amountCents: 0 },
        { label: 'Handling', detail: 'Deburr, pack and label', amountCents: 1200 },
      ],
      nesting: nesting(9, 14, 3, 120, 0.714), totalCents: 110215, createdAt: '2026-08-28T09:42:00.000Z',
    },
    {
      id: 'QT-2026-0377', drawingId: 'dwg_8102', drawingName: 'enclosure-face.dxf',
      materialId: 'mat_al30', materialName: 'Aluminium 5052, 3.0 mm', quantity: 4,
      cutLengthMm: 1980.4, bendCount: 4,
      breakdown: [
        { label: 'Setup', detail: 'One-off machine setup', amountCents: 3500 },
        { label: 'Cutting', detail: '25.99 linear ft @ 2.85/ft', amountCents: 7407 },
        { label: 'Material', detail: '1 × Aluminium 5052, 3.0 mm sheet @ 1.90× multiplier', amountCents: 24938 },
        { label: 'Bending', detail: '4 bend(s) × 4 part(s)', amountCents: 2240 },
        { label: 'Handling', detail: 'Deburr, pack and label', amountCents: 1200 },
      ],
      nesting: nesting(3, 6, 1, 4, 0.188), totalCents: 39285, createdAt: '2026-08-19T16:20:00.000Z',
    },
  ]);

  readonly orders = signal<Order[]>([
    {
      id: 'ord_5501', orderNumber: 'HM-100482', confirmationNumber: 'CNF-7Q4M-2210',
      quoteId: 'QT-2026-0418', email: 'demo.customer@example.com',
      itemSummary: '120 × gusset-plate-v2.dxf — Stainless 304, 2.0 mm',
      shippingMethodName: 'Standard freight',
      shippingAddress: { line1: '88 Kestrel Way', line2: 'Unit 4', city: 'Beaverton', region: 'OR', postalCode: '97005', country: 'United States' },
      estDeliveryDays: 6, totalCents: 112615, status: 'FULFILLED', createdAt: '2026-08-28T10:02:00.000Z',
    },
    {
      id: 'ord_5488', orderNumber: 'HM-100461', confirmationNumber: 'CNF-3B8X-1907',
      quoteId: 'QT-2026-0377', email: 'demo.customer@example.com',
      itemSummary: '4 × enclosure-face.dxf — Aluminium 5052, 3.0 mm',
      shippingMethodName: 'Express courier',
      shippingAddress: { line1: '88 Kestrel Way', line2: 'Unit 4', city: 'Beaverton', region: 'OR', postalCode: '97005', country: 'United States' },
      estDeliveryDays: 2, totalCents: 45185, status: 'PAID', createdAt: '2026-08-19T16:44:00.000Z',
    },
  ]);

  quoteById(id: string): Quote | null {
    return this.quotes().find((q) => q.id === id) ?? null;
  }

  orderById(id: string): Order | null {
    return this.orders().find((o) => o.id === id || o.orderNumber === id) ?? null;
  }
}
