import { Quote } from '@prisma/client';
import { toQuoteView } from './quotes.service';

/**
 * Guards the API contract the Angular `Quote` interface mirrors
 * (frontend/src/app/core/models.ts). The checkout screens read
 * shippingMethodId / shippingCents / shippingAddress off this view, so a field
 * dropped here is a broken checkout flow, not just a type error.
 */
const BASE = {
  id: 'q1',
  drawingId: 'd1',
  drawingName: 'bracket.dxf',
  materialId: 'm1',
  materialName: 'Mild Steel 3mm',
  quantity: 10,
  cutLengthMm: 1000,
  bendCount: 2,
  breakdown: [{ label: 'Setup', detail: 'One-off machine setup', amountCents: 3500 }],
  nesting: { cols: 3, rows: 3, perSheet: 9, sheets: 2, utilization: 0.5, placements: [] },
  totalCents: 41471,
  createdAt: new Date('2026-01-02T03:04:05.000Z'),
  shippingMethodId: null,
  shippingCents: null,
  shipLine1: null,
  shipLine2: null,
  shipCity: null,
  shipRegion: null,
  shipPostalCode: null,
  shipCountry: null,
} as unknown as Quote;

const CONTRACT_KEYS = [
  'id',
  'drawingId',
  'drawingName',
  'materialId',
  'materialName',
  'quantity',
  'cutLengthMm',
  'bendCount',
  'breakdown',
  'nesting',
  'totalCents',
  'createdAt',
  'shippingMethodId',
  'shippingCents',
  'shippingAddress',
];

describe('toQuoteView()', () => {
  it('exposes every field the frontend Quote interface declares', () => {
    expect(Object.keys(toQuoteView(BASE)).sort()).toEqual([...CONTRACT_KEYS].sort());
  });

  it('reports null shipping before the shipping step is completed', () => {
    const view = toQuoteView(BASE);

    expect(view.shippingMethodId).toBeNull();
    expect(view.shippingCents).toBeNull();
    expect(view.shippingAddress).toBeNull();
  });

  it('flattens the persisted ship* columns into an address once chosen', () => {
    const view = toQuoteView({
      ...BASE,
      shippingMethodId: 'sm1',
      shippingCents: 2400,
      shipLine1: '12 Forge Rd',
      shipLine2: 'Unit 4',
      shipCity: 'Sheffield',
      shipRegion: 'South Yorkshire',
      shipPostalCode: 'S1 2AB',
      shipCountry: 'GB',
    } as unknown as Quote);

    expect(view.shippingMethodId).toBe('sm1');
    expect(view.shippingCents).toBe(2400);
    expect(view.shippingAddress).toEqual({
      line1: '12 Forge Rd',
      line2: 'Unit 4',
      city: 'Sheffield',
      region: 'South Yorkshire',
      postalCode: 'S1 2AB',
      country: 'GB',
    });
  });

  it('serialises createdAt as an ISO string the SPA can parse', () => {
    expect(toQuoteView(BASE).createdAt).toBe('2026-01-02T03:04:05.000Z');
  });

  it('defaults a missing breakdown to an empty array rather than null', () => {
    const view = toQuoteView({ ...BASE, breakdown: null } as unknown as Quote);
    expect(view.breakdown).toEqual([]);
  });
});
