import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { BendDto, BendPatchDto } from './drawings.dto';

function errorsFor<T extends object>(cls: new () => T, payload: unknown): string[] {
  const instance = plainToInstance(cls, payload as object);
  return validateSync(instance as object).map((error) => error.property);
}

const VALID = { startX: 0, startY: 0, endX: 50, endY: 0, angleDeg: 90, direction: 'UP' };

describe('BendDto', () => {
  it('accepts a well-formed bend', () => {
    expect(errorsFor(BendDto, VALID)).toEqual([]);
  });

  it.each([0, 90, 180])('accepts the boundary angle %p', (angleDeg) => {
    expect(errorsFor(BendDto, { ...VALID, angleDeg })).toEqual([]);
  });

  it.each([-1, 181, 360])('rejects the out-of-range angle %p', (angleDeg) => {
    expect(errorsFor(BendDto, { ...VALID, angleDeg })).toContain('angleDeg');
  });

  it('rejects a direction outside UP/DOWN', () => {
    expect(errorsFor(BendDto, { ...VALID, direction: 'SIDEWAYS' })).toContain('direction');
  });

  it('accepts DOWN', () => {
    expect(errorsFor(BendDto, { ...VALID, direction: 'DOWN' })).toEqual([]);
  });

  it('rejects a missing endpoint', () => {
    const { endX, ...withoutEndX } = VALID;
    expect(errorsFor(BendDto, withoutEndX)).toContain('endX');
  });
});

describe('BendPatchDto', () => {
  it('accepts an empty patch — every field is optional', () => {
    expect(errorsFor(BendPatchDto, {})).toEqual([]);
  });

  it('still enforces the angle range on a partial update', () => {
    expect(errorsFor(BendPatchDto, { angleDeg: 181 })).toContain('angleDeg');
    expect(errorsFor(BendPatchDto, { angleDeg: -1 })).toContain('angleDeg');
    expect(errorsFor(BendPatchDto, { angleDeg: 45 })).toEqual([]);
  });

  it('still enforces the direction enum on a partial update', () => {
    expect(errorsFor(BendPatchDto, { direction: 'LEFT' })).toContain('direction');
  });
});
