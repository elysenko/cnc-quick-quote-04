import { BreakdownLine, MachineConfig, Material, Nesting, PricingConfig } from '../../core/models';

const MM_PER_LINEAR_FT = 304.8;

/** Deterministic top-left grid nesting — no polygon packing, exactly as specified. */
export function nest(
  partW: number,
  partH: number,
  quantity: number,
  material: Material,
  machine: MachineConfig,
): Nesting | null {
  const { spacingMm: spacing, marginMm: margin } = machine;
  if (partW > material.sheetWMm || partH > material.sheetHMm) return null;

  const cols = Math.max(0, Math.floor((material.sheetWMm - 2 * margin + spacing) / (partW + spacing)));
  const rows = Math.max(0, Math.floor((material.sheetHMm - 2 * margin + spacing) / (partH + spacing)));
  const perSheet = cols * rows;
  if (perSheet === 0) return null;

  const sheets = Math.max(1, Math.ceil(quantity / perSheet));
  const placements = [];
  for (let i = 0; i < quantity; i++) {
    const sheet = Math.floor(i / perSheet);
    const index = i % perSheet;
    placements.push({
      x: margin + (index % cols) * (partW + spacing),
      y: margin + Math.floor(index / cols) * (partH + spacing),
      sheet,
    });
  }

  const sheetArea = material.sheetWMm * material.sheetHMm * sheets;
  const utilization = sheetArea > 0 ? (partW * partH * quantity) / sheetArea : 0;
  return { cols, rows, perSheet, sheets, utilization, placements };
}

/** ROUND_HALF_UP to whole cents — money never leaves this function as a float. */
function cents(value: number): number {
  return Math.floor(value + 0.5);
}

export interface PriceResult { lines: BreakdownLine[]; totalCents: number; rawCents: number; }

export function price(
  cutLengthMm: number,
  quantity: number,
  bendCount: number,
  nesting: Nesting,
  material: Material,
  pricing: PricingConfig,
): PriceResult {
  const cutFt = (cutLengthMm * quantity) / MM_PER_LINEAR_FT;
  const cutting = cents(cutFt * pricing.costPerLinearFtCents);
  const perSheetCost = material.sheetWMm * material.sheetHMm * 0.00042 * 100;
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
    { label: 'Bending', detail: `${bendCount} bend(s) × ${quantity} part(s)`, amountCents: bending },
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
