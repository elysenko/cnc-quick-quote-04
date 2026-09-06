import { DxfParseError, parseDxf } from './dxf-parser';

/** Builds an ASCII DXF from (group code, value) pairs — the on-disk format exactly. */
function dxf(...pairs: (string | number)[][]): Buffer {
  const body = pairs.map(([code, value]) => `${code}\n${value}`).join('\n');
  return Buffer.from(`${body}\n0\nEOF\n`, 'utf8');
}

const ENTITIES_OPEN: (string | number)[][] = [
  [0, 'SECTION'],
  [2, 'ENTITIES'],
];
const ENTITIES_CLOSE: (string | number)[][] = [[0, 'ENDSEC']];

const LINE_0_0_TO_100_0: (string | number)[][] = [
  [0, 'LINE'],
  [10, 0],
  [20, 0],
  [11, 100],
  [21, 0],
];

const CIRCLE_R25_AT_50_50: (string | number)[][] = [
  [0, 'CIRCLE'],
  [10, 50],
  [20, 50],
  [40, 25],
];

describe('parseDxf()', () => {
  it('parses a LINE and a CIRCLE with analytic cut length and correct extents', () => {
    const result = parseDxf(
      dxf(...ENTITIES_OPEN, ...LINE_0_0_TO_100_0, ...CIRCLE_R25_AT_50_50, ...ENTITIES_CLOSE),
    );

    expect(result.entityCount).toBe(2);
    // 100mm line + circumference of r=25 (2 * PI * 25 = 157.0796)
    expect(result.cutLengthMm).toBeCloseTo(100 + 2 * Math.PI * 25, 1);
    expect(result.bbox.maxX - result.bbox.minX).toBeCloseTo(100, 6);
    expect(result.bbox.maxY - result.bbox.minY).toBeCloseTo(75, 6);
    expect(result.paths).toHaveLength(2);
  });

  it('normalises paths to a top-left origin', () => {
    const result = parseDxf(
      dxf(...ENTITIES_OPEN, ...LINE_0_0_TO_100_0, ...CIRCLE_R25_AT_50_50, ...ENTITIES_CLOSE),
    );
    const xs = result.paths.flatMap((path) => path.filter((_, i) => i % 2 === 0));
    const ys = result.paths.flatMap((path) => path.filter((_, i) => i % 2 === 1));

    expect(Math.min(...xs)).toBeCloseTo(0, 6);
    expect(Math.min(...ys)).toBeCloseTo(0, 6);
  });

  it('measures an LWPOLYLINE as the sum of its segments', () => {
    const result = parseDxf(
      dxf(
        ...ENTITIES_OPEN,
        [0, 'LWPOLYLINE'],
        [90, 3],
        [10, 0],
        [20, 0],
        [10, 30],
        [20, 0],
        [10, 30],
        [20, 40],
        ...ENTITIES_CLOSE,
      ),
    );

    expect(result.entityCount).toBe(1);
    expect(result.cutLengthMm).toBeCloseTo(30 + 40, 6);
  });

  it('rejects an empty file', () => {
    expect(() => parseDxf(Buffer.from('', 'utf8'))).toThrow(DxfParseError);
  });

  it('rejects a file with no ENTITIES section', () => {
    expect(() => parseDxf(Buffer.from('this is not a drawing at all\n', 'utf8'))).toThrow(
      /ENTITIES|not a DXF/i,
    );
  });

  it('rejects a drawing whose geometry is only unsupported entities', () => {
    expect(() =>
      parseDxf(
        dxf(...ENTITIES_OPEN, [0, 'SPLINE'], [10, 0], [20, 0], [10, 50], [20, 50], ...ENTITIES_CLOSE),
      ),
    ).toThrow(/No cuttable geometry/i);
  });

  it('rejects a binary DXF rather than mis-measuring it', () => {
    const binary = Buffer.from(`AutoCAD Binary DXF${String.fromCharCode(0)}`, 'binary');
    expect(() => parseDxf(binary)).toThrow(/Binary DXF/i);
  });

  it('rejects a drawing with no measurable extents', () => {
    expect(() =>
      parseDxf(
        dxf(...ENTITIES_OPEN, [0, 'LINE'], [10, 5], [20, 5], [11, 5], [21, 5], ...ENTITIES_CLOSE),
      ),
    ).toThrow(DxfParseError);
  });
});
