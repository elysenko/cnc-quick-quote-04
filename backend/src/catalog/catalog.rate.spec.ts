import { ShippingMethod } from '@prisma/client';
import { CatalogService } from './catalog.service';

const flat = { rateType: 'FLAT', amountCents: 1200 } as unknown as ShippingMethod;
const perSheet = { rateType: 'PER_SHEET', amountCents: 800 } as unknown as ShippingMethod;

describe('CatalogService.rateFor()', () => {
  it('charges a flat method once, whatever the sheet count', () => {
    expect(CatalogService.rateFor(flat, 1)).toBe(1200);
    expect(CatalogService.rateFor(flat, 7)).toBe(1200);
  });

  it('multiplies a per-sheet method by the nested sheet count', () => {
    expect(CatalogService.rateFor(perSheet, 3)).toBe(2400);
  });

  it('never charges less than one sheet', () => {
    expect(CatalogService.rateFor(perSheet, 0)).toBe(800);
    expect(CatalogService.rateFor(perSheet, -1)).toBe(800);
  });

  it('returns integer cents', () => {
    expect(Number.isInteger(CatalogService.rateFor(perSheet, 5))).toBe(true);
  });
});
