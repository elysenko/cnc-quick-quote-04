import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';

export interface RateLimitOptions {
  bucket: string;
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMIT_KEY = 'colossus:rate-limit';

/** Fixed-window limiter. `@RateLimit({ bucket, limit, windowSeconds })` on a handler. */
export const RateLimit = (options: RateLimitOptions): MethodDecorator =>
  SetMetadata(RATE_LIMIT_KEY, options);

interface Window {
  count: number;
  resetAt: number;
}

/**
 * In-process fixed-window counter keyed by `bucket:userId|ip`. Deliberately not
 * Redis-backed: this deployment runs a single API replica and Redis is not part of
 * the provisioned namespace, so an external counter would be a hard dependency on a
 * service that is not there.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly windows = new Map<string, Window>();
  private lastSweep = 0;

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!options) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: { sub: string } }>();
    const response = context.switchToHttp().getResponse<Response>();
    const identity = request.user?.sub ?? request.ip ?? 'anonymous';
    const key = `${options.bucket}:${identity}`;
    const now = Date.now();

    this.sweep(now);

    const existing = this.windows.get(key);
    if (!existing || existing.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + options.windowSeconds * 1000 });
      return true;
    }

    existing.count += 1;
    if (existing.count > options.limit) {
      const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      response.setHeader('Retry-After', String(retryAfter));
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'TooManyRequests',
          message: `Too many requests. Try again in ${retryAfter}s.`,
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }

  /** Drops expired windows at most once a minute so the map cannot grow unbounded. */
  private sweep(now: number): void {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key);
    }
  }
}
