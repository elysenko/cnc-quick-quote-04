import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Credential resolution order: process env wins, then the `system_settings` row an
 * admin saved through the console, then null. Callers throw ServiceUnconfiguredError
 * on null — never a hardcoded fallback value.
 */
@Injectable()
export class RuntimeConfigService {
  private readonly logger = new Logger(RuntimeConfigService.name);

  constructor(private readonly prisma: PrismaService) {}

  async resolveConfig(key: string): Promise<string | null> {
    const fromEnv = process.env[key];
    if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) return fromEnv.trim();

    try {
      const row = await this.prisma.systemSetting.findUnique({ where: { key } });
      const value = row?.value?.trim();
      return value ? value : null;
    } catch (error) {
      this.logger.warn(`system_settings lookup failed for ${key}: ${(error as Error).message}`);
      return null;
    }
  }

  /** First non-null of several keys — lets a service accept either its own key or a shared one. */
  async resolveFirst(...keys: string[]): Promise<string | null> {
    for (const key of keys) {
      const value = await this.resolveConfig(key);
      if (value) return value;
    }
    return null;
  }

  async setConfig(key: string, value: string): Promise<void> {
    await this.prisma.systemSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  async clearConfig(key: string): Promise<void> {
    await this.prisma.systemSetting.deleteMany({ where: { key } });
  }

  /** Never echo a secret back: last four characters only. */
  static mask(value: string | null | undefined): string {
    if (!value) return '';
    return `••••••••${value.slice(-4)}`;
  }
}
