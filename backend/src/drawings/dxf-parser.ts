/**
 * Minimal ASCII/DXF reader for the five entity types this shop cuts:
 * LINE, ARC, CIRCLE, LWPOLYLINE and POLYLINE.
 *
 * A DXF file is a flat stream of (group code, value) pairs. We walk the ENTITIES
 * section, collect the codes belonging to each entity, and flatten every entity to
 * a polyline run — the same shape the canvas draws and the pricing engine measures.
 *
 * Anything else in the file (SPLINE, INSERT/block references, text) is ignored, so a
 * drawing whose geometry lives only in those will parse to zero entities and be
 * rejected rather than silently under-priced.
 */

export interface ParsedEntity {
  type: string;
  /** Flat [x0,y0,x1,y1,…] run. Curves are flattened to chords for drawing only. */
  points: number[];
  /** True arc/circle length — measured analytically, never from the chords. */
  lengthMm: number;
}

export interface ParsedDrawing {
  entityCount: number;
  cutLengthMm: number;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  paths: number[][];
}

export class DxfParseError extends Error {}

const SUPPORTED = new Set(['LINE', 'ARC', 'CIRCLE', 'LWPOLYLINE', 'POLYLINE']);
const ARC_SEGMENTS_PER_TURN = 64;
const NUL = String.fromCharCode(0);

interface Pair {
  code: number;
  value: string;
}

function readPairs(text: string): Pair[] {
  // DXF is line-oriented: an integer group code, then its value on the next line.
  const lines = text.split(/\r\n|\r|\n/);
  const pairs: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number.parseInt(lines[i].trim(), 10);
    if (!Number.isFinite(code)) continue;
    pairs.push({ code, value: lines[i + 1] });
  }
  return pairs;
}

function num(value: string | undefined, fallback = 0): number {
  const parsed = Number.parseFloat((value ?? '').trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Group codes collected for one entity, plus the vertex list for a legacy POLYLINE. */
interface RawEntity {
  type: string;
  codes: Map<number, string[]>;
  vertices: Array<{ x: number; y: number }>;
}

function blank(type: string): RawEntity {
  return { type, codes: new Map<number, string[]>(), vertices: [] };
}

function vertexOf(raw: RawEntity): { x: number; y: number } {
  return { x: num(raw.codes.get(10)?.[0]), y: num(raw.codes.get(20)?.[0]) };
}

function collect(pairs: Pair[]): RawEntity[] {
  const entities: RawEntity[] = [];
  let inEntities = false;
  let current: RawEntity | null = null;
  let polyline: RawEntity | null = null;

  /**
   * Files the entity under construction. A VERTEX belongs to the POLYLINE that is
   * still open; a POLYLINE stays referenced after filing so its trailing vertices
   * can be appended to it.
   */
  const flush = (): void => {
    if (!current) return;
    if (current.type === 'VERTEX') {
      if (polyline) polyline.vertices.push(vertexOf(current));
    } else if (SUPPORTED.has(current.type)) {
      entities.push(current);
      if (current.type === 'POLYLINE') polyline = current;
    }
    current = null;
  };

  for (const { code, value } of pairs) {
    const token = value.trim();

    if (code === 2 && token === 'ENTITIES') {
      inEntities = true;
      continue;
    }
    if (!inEntities) continue;

    if (code === 0) {
      flush();
      if (token === 'ENDSEC') {
        polyline = null;
        inEntities = false;
        continue;
      }
      if (token === 'SEQEND') {
        polyline = null;
        continue;
      }
      current = blank(token);
      continue;
    }

    if (current) {
      const bucket = current.codes.get(code);
      if (bucket) bucket.push(value);
      else current.codes.set(code, [value]);
    }
  }

  flush();
  return entities;
}

function arcPoints(cx: number, cy: number, r: number, startDeg: number, sweepDeg: number): number[] {
  const steps = Math.max(2, Math.ceil((sweepDeg / 360) * ARC_SEGMENTS_PER_TURN));
  const points: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = ((startDeg + (sweepDeg * i) / steps) * Math.PI) / 180;
    points.push(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
  }
  return points;
}

function polylineLength(points: number[]): number {
  let total = 0;
  for (let i = 2; i < points.length; i += 2) {
    total += Math.hypot(points[i] - points[i - 2], points[i + 1] - points[i - 1]);
  }
  return total;
}

function toEntity(raw: RawEntity): ParsedEntity | null {
  const first = (code: number, fallback = 0): number => num(raw.codes.get(code)?.[0], fallback);

  if (raw.type === 'LINE') {
    const points = [first(10), first(20), first(11), first(21)];
    return { type: 'LINE', points, lengthMm: polylineLength(points) };
  }

  if (raw.type === 'CIRCLE') {
    const r = first(40);
    if (r <= 0) return null;
    return {
      type: 'CIRCLE',
      points: arcPoints(first(10), first(20), r, 0, 360),
      lengthMm: 2 * Math.PI * r,
    };
  }

  if (raw.type === 'ARC') {
    const r = first(40);
    if (r <= 0) return null;
    const start = first(50);
    let sweep = first(51) - start;
    while (sweep <= 0) sweep += 360;
    return {
      type: 'ARC',
      points: arcPoints(first(10), first(20), r, start, sweep),
      lengthMm: (sweep / 360) * 2 * Math.PI * r,
    };
  }

  if (raw.type === 'LWPOLYLINE') {
    // 10/20 repeat once per vertex on a lightweight polyline.
    const xs = raw.codes.get(10) ?? [];
    const ys = raw.codes.get(20) ?? [];
    const count = Math.min(xs.length, ys.length);
    if (count < 2) return null;
    const points: number[] = [];
    for (let i = 0; i < count; i++) points.push(num(xs[i]), num(ys[i]));
    if ((first(70) & 1) === 1) points.push(points[0], points[1]);
    return { type: 'LWPOLYLINE', points, lengthMm: polylineLength(points) };
  }

  if (raw.type === 'POLYLINE') {
    // A legacy POLYLINE carries its geometry in trailing VERTEX entities.
    if (raw.vertices.length < 2) return null;
    const points: number[] = [];
    for (const vertex of raw.vertices) points.push(vertex.x, vertex.y);
    if ((first(70) & 1) === 1) points.push(points[0], points[1]);
    return { type: 'POLYLINE', points, lengthMm: polylineLength(points) };
  }

  return null;
}

/**
 * Parses DXF bytes. Throws DxfParseError with a customer-readable reason for
 * anything unusable — the caller turns that into a 422.
 */
export function parseDxf(buffer: Buffer): ParsedDrawing {
  const text = buffer.toString('utf8');

  if (text.includes(NUL) || text.startsWith('AutoCAD Binary DXF')) {
    throw new DxfParseError('Binary DXF is not supported. Re-export the drawing as an ASCII DXF.');
  }

  const pairs = readPairs(text);
  if (pairs.length === 0) {
    throw new DxfParseError('That file is empty or is not a DXF drawing.');
  }
  if (!pairs.some((pair) => pair.code === 2 && pair.value.trim() === 'ENTITIES')) {
    throw new DxfParseError('The drawing has no ENTITIES section — it may be corrupt.');
  }

  const entities = collect(pairs)
    .map(toEntity)
    .filter((entity): entity is ParsedEntity => entity !== null && entity.points.length >= 4);

  if (entities.length === 0) {
    throw new DxfParseError(
      'No cuttable geometry found. This app reads LINE, ARC, CIRCLE, LWPOLYLINE and POLYLINE ' +
        'entities — explode blocks and convert splines before exporting.',
    );
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let cutLengthMm = 0;

  for (const entity of entities) {
    cutLengthMm += entity.lengthMm;
    for (let i = 0; i < entity.points.length; i += 2) {
      const x = entity.points[i];
      const y = entity.points[i + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (!Number.isFinite(minX) || maxX - minX <= 0 || maxY - minY <= 0) {
    throw new DxfParseError('The drawing has no measurable extents — check its units and scale.');
  }

  // Normalise to a top-left origin so the canvas and the nesting grid share one frame.
  const paths = entities.map((entity) => {
    const shifted: number[] = [];
    for (let i = 0; i < entity.points.length; i += 2) {
      shifted.push(entity.points[i] - minX, entity.points[i + 1] - minY);
    }
    return shifted;
  });

  return {
    entityCount: entities.length,
    cutLengthMm: Math.round(cutLengthMm * 10) / 10,
    bbox: { minX: 0, minY: 0, maxX: maxX - minX, maxY: maxY - minY },
    paths,
  };
}
