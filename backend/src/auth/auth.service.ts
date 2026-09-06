import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthResultDto, JwtPayload, SessionUserDto } from './auth.types';

const BCRYPT_ROUNDS = 10;
const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_DAYS = 30;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  static toSessionUser(user: User): SessionUserDto {
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }

  /**
   * The very first account on an empty instance is promoted to ADMIN so the operator
   * can reach the console. Colossus normally seeds an ADMIN first, in which case every
   * self-service signup is a plain customer.
   */
  async register(email: string, password: string, name?: string): Promise<AuthResultDto> {
    const normalised = email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email: normalised } });
    if (existing) throw new ConflictException('That email address is already registered.');

    const userCount = await this.prisma.user.count();
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    try {
      const user = await this.prisma.user.create({
        data: {
          email: normalised,
          name: name?.trim() || null,
          passwordHash,
          role: userCount === 0 ? Role.ADMIN : Role.USER,
        },
      });
      return this.issue(user);
    } catch {
      // Unique violation from a concurrent signup on the same address.
      throw new ConflictException('That email address is already registered.');
    }
  }

  async login(email: string, password: string): Promise<AuthResultDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    // Compare against a dummy hash when the user is absent so the response time
    // does not reveal whether an address is registered.
    const hash = user?.passwordHash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi';
    const ok = await bcrypt.compare(password, hash);
    if (!user || !ok) throw new UnauthorizedException('Email or password is incorrect.');
    return this.issue(user);
  }

  async refresh(refreshToken: string): Promise<AuthResultDto> {
    const record = await this.prisma.refreshToken.findUnique({ where: { jti: refreshToken } });
    if (!record || record.revokedAt || record.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Your session has expired. Sign in again.');
    }
    const user = await this.prisma.user.findUnique({ where: { id: record.userId } });
    if (!user) throw new UnauthorizedException('Your session has expired. Sign in again.');

    // Rotate: the presented handle is retired the moment a new one is issued.
    await this.prisma.refreshToken.update({
      where: { jti: refreshToken },
      data: { revokedAt: new Date() },
    });
    return this.issue(user);
  }

  async logout(refreshToken: string | undefined, userId: string): Promise<void> {
    if (refreshToken) {
      await this.prisma.refreshToken.updateMany({
        where: { jti: refreshToken, userId },
        data: { revokedAt: new Date() },
      });
      return;
    }
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(payload: JwtPayload): Promise<SessionUserDto> {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException('Your account is no longer available.');
    return AuthService.toSessionUser(user);
  }

  private async issue(user: User): Promise<AuthResultDto> {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = await this.jwt.signAsync(payload, { expiresIn: ACCESS_TTL_SECONDS });

    const jti = randomUUID();
    const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 86_400_000);
    await this.prisma.refreshToken.create({ data: { jti, userId: user.id, expiresAt } });
    await this.pruneExpired(user.id);

    return {
      user: AuthService.toSessionUser(user),
      accessToken,
      refreshToken: jti,
      expiresIn: ACCESS_TTL_SECONDS,
    };
  }

  /** Best-effort housekeeping — a failure here must never break a successful sign-in. */
  private async pruneExpired(userId: string): Promise<void> {
    try {
      await this.prisma.refreshToken.deleteMany({
        where: { userId, expiresAt: { lt: new Date() } },
      });
    } catch (error) {
      this.logger.warn(`refresh-token prune failed: ${(error as Error).message}`);
    }
  }
}
