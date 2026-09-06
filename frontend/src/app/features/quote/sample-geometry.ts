import { BBox } from '../../core/models';

/**
 * Polyline geometry for the parsed drawing, in millimetres, top-left origin.
 * Each entry is a flat [x0,y0,x1,y1,…] run — the shape the DXF parser emits for
 * LINE / ARC / CIRCLE / LWPOLYLINE / POLYLINE entities once they are flattened.
 */
export const PART_W_MM = 180;
export const PART_H_MM = 120;

function roundedRect(x: number, y: number, w: number, h: number, r: number): number[] {
  const pts: number[] = [];
  const corners: Array<[number, number, number]> = [
    [x + w - r, y + r, -90],
    [x + w - r, y + h - r, 0],
    [x + r, y + h - r, 90],
    [x + r, y + r, 180],
  ];
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i <= 8; i++) {
      const a = ((start + (i / 8) * 90) * Math.PI) / 180;
      pts.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
  }
  pts.push(pts[0], pts[1]);
  return pts;
}

function circle(cx: number, cy: number, r: number, segments = 28): number[] {
  const pts: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  return pts;
}

/** Mounting bracket: rounded outline, four fixing holes and a central relief slot. */
export const PART_PATHS: number[][] = [
  roundedRect(0, 0, PART_W_MM, PART_H_MM, 10),
  circle(18, 18, 5),
  circle(PART_W_MM - 18, 18, 5),
  circle(18, PART_H_MM - 18, 5),
  circle(PART_W_MM - 18, PART_H_MM - 18, 5),
  roundedRect(PART_W_MM / 2 - 32, PART_H_MM / 2 - 7, 64, 14, 7),
];

export const PART_BBOX: BBox = { minX: 0, minY: 0, maxX: PART_W_MM, maxY: PART_H_MM };

/** Summed length of every path — the cut length the pricing engine charges for. */
export function pathLengthMm(paths: number[][]): number {
  let total = 0;
  for (const path of paths) {
    for (let i = 2; i < path.length; i += 2) {
      total += Math.hypot(path[i] - path[i - 2], path[i + 1] - path[i - 1]);
    }
  }
  return Math.round(total * 10) / 10;
}

export const PART_CUT_LENGTH_MM = pathLengthMm(PART_PATHS);
