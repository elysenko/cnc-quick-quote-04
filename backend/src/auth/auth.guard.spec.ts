import 'reflect-metadata';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { JwtAuthGuard, RolesGuard } from './auth.guard';
import { JwtPayload } from './auth.types';

interface FakeRequest {
  headers: Record<string, string>;
  user?: JwtPayload;
}

function contextFor(request: FakeRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

/** Reflector stub: returns whatever metadata the test declares for this route. */
function reflectorFor(value: unknown): Reflector {
  return { getAllAndOverride: () => value } as unknown as Reflector;
}

const CUSTOMER: JwtPayload = { sub: 'u1', email: 'a@b.test', role: Role.USER };
const ADMIN: JwtPayload = { sub: 'u2', email: 'c@d.test', role: Role.ADMIN };

function jwtFor(payload: JwtPayload | null): JwtService {
  return {
    verifyAsync: async () => {
      if (!payload) throw new Error('invalid signature');
      return payload;
    },
  } as unknown as JwtService;
}

describe('JwtAuthGuard — 401 surface', () => {
  it('rejects a protected route with no Authorization header', async () => {
    const guard = new JwtAuthGuard(reflectorFor(false), jwtFor(CUSTOMER));
    await expect(guard.canActivate(contextFor({ headers: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a malformed (non-bearer) Authorization header', async () => {
    const guard = new JwtAuthGuard(reflectorFor(false), jwtFor(CUSTOMER));
    const context = contextFor({ headers: { authorization: 'Basic abc123' } });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an expired or tampered token', async () => {
    const guard = new JwtAuthGuard(reflectorFor(false), jwtFor(null));
    const context = contextFor({ headers: { authorization: 'Bearer tampered' } });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('admits a valid token and attaches the payload to the request', async () => {
    const guard = new JwtAuthGuard(reflectorFor(false), jwtFor(CUSTOMER));
    const request: FakeRequest = { headers: { authorization: 'Bearer good' } };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toEqual(CUSTOMER);
  });

  it('lets an anonymous request through a @Public route', async () => {
    const guard = new JwtAuthGuard(reflectorFor(true), jwtFor(CUSTOMER));
    await expect(guard.canActivate(contextFor({ headers: {} }))).resolves.toBe(true);
  });

  it('does not blow up a @Public route carrying a bad token', async () => {
    const guard = new JwtAuthGuard(reflectorFor(true), jwtFor(null));
    const context = contextFor({ headers: { authorization: 'Bearer tampered' } });
    await expect(context && guard.canActivate(context)).resolves.toBe(true);
  });
});

describe('RolesGuard — 403 surface, distinct from 401', () => {
  it('returns 403 (not 401) for an authenticated customer on an admin route', () => {
    const guard = new RolesGuard(reflectorFor([Role.ADMIN]));
    expect(() => guard.canActivate(contextFor({ headers: {}, user: CUSTOMER }))).toThrow(
      ForbiddenException,
    );
  });

  it('returns 401 for an anonymous request on an admin route', () => {
    const guard = new RolesGuard(reflectorFor([Role.ADMIN]));
    expect(() => guard.canActivate(contextFor({ headers: {} }))).toThrow(UnauthorizedException);
  });

  it('admits an admin', () => {
    const guard = new RolesGuard(reflectorFor([Role.ADMIN]));
    expect(guard.canActivate(contextFor({ headers: {}, user: ADMIN }))).toBe(true);
  });

  it('is a no-op on routes that declare no roles', () => {
    const guard = new RolesGuard(reflectorFor(undefined));
    expect(guard.canActivate(contextFor({ headers: {}, user: CUSTOMER }))).toBe(true);
  });
});
