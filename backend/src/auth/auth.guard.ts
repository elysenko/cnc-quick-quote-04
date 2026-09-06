import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { JwtPayload } from './auth.types';

export const IS_PUBLIC_KEY = 'colossus:public';
/** Opts a route out of JwtAuthGuard. Used by /login, /register, /branding, /health, webhooks. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'colossus:roles';
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);

function bearerFrom(request: Request): string | null {
  const header = request.headers.authorization;
  if (typeof header !== 'string') return null;
  const [scheme, token] = header.split(' ');
  if (!token || scheme.toLowerCase() !== 'bearer') return null;
  return token.trim() || null;
}

/** 401 when the access token is missing, malformed or expired. Never 403 — that is RolesGuard. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const token = bearerFrom(request);

    if (token) {
      try {
        request.user = await this.jwt.verifyAsync<JwtPayload>(token);
      } catch {
        if (!isPublic) throw new UnauthorizedException('Your session has expired. Sign in again.');
      }
    }

    if (isPublic) return true;
    if (!request.user) throw new UnauthorizedException('Sign in to continue.');
    return true;
  }
}

/** 403 for an authenticated user without the required role — deliberately distinct from 401. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    if (!request.user) throw new UnauthorizedException('Sign in to continue.');
    if (!required.includes(request.user.role)) {
      throw new ForbiddenException('This area is restricted to administrators.');
    }
    return true;
  }
}
