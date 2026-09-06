import { price } from './pricing';

const material = {
  name: 'Mild Steel 3mm',
  sheetWMm: 1250,
  sheetHMm: 2500,
  costMultiplier: 1,
};

const pricing = {
  costPerLinearFtCents: 150,
  setupFeeCents: 3500,
  handlingFeeCents: 1200,
  minOrderCents: 7500,
  costPerBendCents: 280,
};

function lineFor(lines: { label: string; amountCents: number }[], label: string): number {
  const line = lines.find((entry) => entry.label === label);
  expect(line).toBeDefined();
  return line!.amountCents;
}

describe('price()', () => {
  it('matches the hand-computed breakdown in whole cents', () => {
    // cutFt = 1000mm x 10 / 304.8 = 32.808399 ft -> 32.808399 * 150c = 4921c
    // material = 2 sheets x (1250 x 2500 x 0.0042) x 1.00 = 26250c
    // bending  = 2 bends x 10 parts x 280c = 5600c
    const result = price(1000, 10, 2, { sheets: 2 }, material, pricing);

    expect(lineFor(result.lines, 'Setup')).toBe(3500);
    expect(lineFor(result.lines, 'Cutting')).toBe(4921);
    expect(lineFor(result.lines, 'Material')).toBe(26250);
    expect(lineFor(result.lines, 'Bending')).toBe(5600);
    expect(lineFor(result.lines, 'Handling')).toBe(1200);

    expect(result.rawCents).toBe(3500 + 4921 + 26250 + 5600 + 1200);
    expect(result.totalCents).toBe(result.rawCents);
    expect(result.lines.map((line) => line.label)).not.toContain('Minimum order adjustment');
  });

  it('sums the breakdown lines to exactly the total', () => {
    const result = price(1000, 10, 2, { sheets: 2 }, material, pricing);
    const summed = result.lines.reduce((sum, line) => sum + line.amountCents, 0);
    expect(summed).toBe(result.totalCents);
  });

  it('applies the material multiplier to sheet stock only', () => {
    const plain = price(1000, 10, 2, { sheets: 2 }, material, pricing);
    const exotic = price(1000, 10, 2, { sheets: 2 }, { ...material, costMultiplier: 2 }, pricing);

    expect(lineFor(exotic.lines, 'Material')).toBe(lineFor(plain.lines, 'Material') * 2);
    expect(lineFor(exotic.lines, 'Cutting')).toBe(lineFor(plain.lines, 'Cutting'));
  });

  it('floors a sub-minimum job to exactly the order minimum and shows the adjustment', () => {
    const bare = { ...pricing, setupFeeCents: 0, handlingFeeCents: 0, costPerBendCents: 0 };
    const result = price(10, 1, 0, { sheets: 1 }, { ...material, costMultiplier: 0 }, bare);

    expect(result.rawCents).toBeLessThan(bare.minOrderCents);
    expect(result.totalCents).toBe(bare.minOrderCents);
    expect(lineFor(result.lines, 'Minimum order adjustment')).toBe(
      bare.minOrderCents - result.rawCents,
    );
  });

  it('returns integer cents for every line', () => {
    const result = price(1234.567, 7, 3, { sheets: 3 }, { ...material, costMultiplier: 1.37 }, pricing);
    for (const line of result.lines) {
      expect(Number.isInteger(line.amountCents)).toBe(true);
    }
    expect(Number.isInteger(result.totalCents)).toBe(true);
  });

  it('is a pure function of the snapshotted config, so a later admin edit cannot move a quote', () => {
    const original = price(1000, 10, 2, { sheets: 2 }, material, pricing);
    const raised = { ...pricing, costPerLinearFtCents: 900 };

    // Re-pricing with the snapshot still yields the original total.
    expect(price(1000, 10, 2, { sheets: 2 }, material, pricing).totalCents).toBe(
      original.totalCents,
    );
    expect(price(1000, 10, 2, { sheets: 2 }, material, raised).totalCents).not.toBe(
      original.totalCents,
    );
  });
});
