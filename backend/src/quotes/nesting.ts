import { MachineConfig, Material } from '@prisma/client';

export interface Placement {
  x: number;
  y: number;
  sheet: number;
}

export interface NestResult {
  cols: number;
  rows: number;
  perSheet: number;
  sheets: number;
  utilization: number;
  placements: Placement[];
}

/**
 * Deterministic top-left row/column grid packing — no polygon nesting.
 *
 * Returns null when the part cannot be laid on the sheet at all; the caller turns
 * that into a 422 before any quote row is written.
 */
export function nest(
  partWMm: number,
  partHMm: number,
  quantity: number,
  material: Pick<Material, 'sheetWMm' | 'sheetHMm'>,
  machine: Pick<MachineConfig, 'spacingMm' | 'marginMm'>,
): NestResult | null {
  const spacing = machine.spacingMm;
  const margin = machine.marginMm;

  if (partWMm <= 0 || partHMm <= 0) return null;
  if (partWMm > material.sheetWMm || partHMm > material.sheetHMm) return null;

  const cols = Math.max(
    0,
    Math.floor((material.sheetWMm - 2 * margin + spacing) / (partWMm + spacing)),
  );
  const rows = Math.max(
    0,
    Math.floor((material.sheetHMm - 2 * margin + spacing) / (partHMm + spacing)),
  );
  const perSheet = cols * rows;
  if (perSheet === 0) return null;

  const sheets = Math.max(1, Math.ceil(quantity / perSheet));

  const placements: Placement[] = [];
  for (let i = 0; i < quantity; i++) {
    const index = i % perSheet;
    placements.push({
      x: margin + (index % cols) * (partWMm + spacing),
      y: margin + Math.floor(index / cols) * (partHMm + spacing),
      sheet: Math.floor(i / perSheet),
    });
  }

  const sheetArea = material.sheetWMm * material.sheetHMm * sheets;
  const utilization = sheetArea > 0 ? (partWMm * partHMm * quantity) / sheetArea : 0;

  return { cols, rows, perSheet, sheets, utilization, placements };
}
