import { Material, PricingConfig } from '@prisma/client';
import { NestResult } from './nesting';

const MM_PER_LINEAR_FT = 304.8;
/**
 * Sheet stock cost per mm² before the material multiplier, in cents.
 * 0.0042 c/mm² puts a 1250 × 2500 mm sheet at $131.25 base — realistic mill stock.
 */
const SHEET_COST_CENTS_PER_MM2 = 0.0042;

export interface BreakdownLine {
  label: string;
  detail: string;
  amountCents: number;
}

export interface PriceResult {
  lines: BreakdownLine[];
  totalCents: number;
  rawCents: number;
}

/** ROUND_HALF_UP to whole cents — money never leaves this module as a float. */
function cents(value: number): number {
  return Math.floor(value + 0.5);
}

/**
 * total = max(minOrder, setup + cutFt×rate + sheets×sheetCost×multiplier + handling + bends×rate)
 *
 * The caller passes the pricing config that was snapshotted onto the quote, so a
 * later admin edit can never move an existing quote's total.
 */
export function price(
  cutLengthMm: number,
  quantity: number,
  bendCount: number,
  nesting: Pick<NestResult, 'sheets'>,
  material: Pick<Material, 'name' | 'sheetWMm' | 'sheetHMm' | 'costMultiplier'>,
  pricing: Pick<
    PricingConfig,
    | 'costPerLinearFtCents'
    | 'setupFeeCents'
    | 'handlingFeeCents'
    | 'minOrderCents'
    | 'costPerBendCents'
  >,
): PriceResult {
  const cutFt = (cutLengthMm * quantity) / MM_PER_LINEAR_FT;
  const cutting = cents(cutFt * pricing.costPerLinearFtCents);
  const perSheetCost = material.sheetWMm * material.sheetHMm * SHEET_COST_CENTS_PER_MM2;
  const materialCost = cents(nesting.sheets * perSheetCost * material.costMultiplier);
  const bending = cents(bendCount * quantity * pricing.costPerBendCents);

  const lines: BreakdownLine[] = [
    { label: 'Setup', detail: 'One-off machine setup', amountCents: pricing.setupFeeCents },
    {
      label: 'Cutting',
      detail: `${cutFt.toFixed(2)} linear ft @ ${(pricing.costPerLinearFtCents / 100).toFixed(2)}/ft`,
      amountCents: cutting,
    },
    {
      label: 'Material',
      detail: `${nesting.sheets} × ${material.name} sheet @ ${material.costMultiplier.toFixed(2)}× multiplier`,
      amountCents: materialCost,
    },
    {
      label: 'Bending',
      detail: `${bendCount} bend(s) × ${quantity} part(s)`,
      amountCents: bending,
    },
    { label: 'Handling', detail: 'Deburr, pack and label', amountCents: pricing.handlingFeeCents },
  ];

  const rawCents = lines.reduce((sum, line) => sum + line.amountCents, 0);
  const totalCents = Math.max(pricing.minOrderCents, rawCents);
  if (totalCents > rawCents) {
    lines.push({
      label: 'Minimum order adjustment',
      detail: `Order minimum of ${(pricing.minOrderCents / 100).toFixed(2)} applied`,
      amountCents: totalCents - rawCents,
    });
  }

  return { lines, totalCents, rawCents };
}
