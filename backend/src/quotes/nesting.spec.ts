import { nest } from './nesting';

const material = { sheetWMm: 1000, sheetHMm: 1000 };
const machine = { spacingMm: 10, marginMm: 20 };

describe('nest()', () => {
  it('packs a single sheet when the quantity fits the grid', () => {
    // (1000 - 40 + 10) / (300 + 10) = 3.12 -> 3 cols, 3 rows, 9 per sheet.
    const result = nest(300, 300, 9, material, machine);

    expect(result).not.toBeNull();
    expect(result!.cols).toBe(3);
    expect(result!.rows).toBe(3);
    expect(result!.perSheet).toBe(9);
    expect(result!.sheets).toBe(1);
    expect(result!.placements).toHaveLength(9);
  });

  it('emits top-left origin placements offset by margin and spacing', () => {
    const result = nest(300, 300, 4, material, machine)!;

    expect(result.placements[0]).toEqual({ x: 20, y: 20, sheet: 0 });
    expect(result.placements[1]).toEqual({ x: 330, y: 20, sheet: 0 });
    expect(result.placements[3]).toEqual({ x: 20, y: 330, sheet: 0 });
  });

  it('rolls onto additional sheets once per-sheet capacity is exceeded', () => {
    const result = nest(300, 300, 20, material, machine)!;

    expect(result.perSheet).toBe(9);
    expect(result.sheets).toBe(3); // ceil(20 / 9)
    expect(result.placements[9].sheet).toBe(1);
    expect(result.placements[19].sheet).toBe(2);
  });

  it('returns null when the part is wider than the sheet', () => {
    expect(nest(1200, 300, 1, material, machine)).toBeNull();
  });

  it('returns null when the part is taller than the sheet', () => {
    expect(nest(300, 1200, 1, material, machine)).toBeNull();
  });

  it('returns null when margins leave no room for even one part', () => {
    expect(nest(990, 990, 1, material, machine)).toBeNull();
  });

  it('returns null for non-positive dimensions', () => {
    expect(nest(0, 300, 1, material, machine)).toBeNull();
    expect(nest(300, -5, 1, material, machine)).toBeNull();
  });

  it('reports utilization as part area over consumed sheet area', () => {
    const result = nest(500, 500, 1, material, machine)!;
    expect(result.utilization).toBeCloseTo(0.25, 6);
  });
});
