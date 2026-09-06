import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../drawings/storage.service';

interface DeepHealth {
  status: 'ok' | 'degraded';
  checks: Record<string, { status: 'up' | 'down'; message?: string }>;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Liveness: answers as long as the process is up. Never touches a backing service. */
  @Public()
  @Get()
  check(): { status: string; uptime: number } {
    return { status: 'ok', uptime: Math.round(process.uptime()) };
  }

  /** Readiness: asserts Postgres and object storage are actually reachable. */
  @Public()
  @Get('deep')
  async deep(): Promise<DeepHealth> {
    const checks: DeepHealth['checks'] = {};

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks['database'] = { status: 'up' };
    } catch (error) {
      checks['database'] = { status: 'down', message: (error as Error).message };
    }

    try {
      await this.storage.ping();
      checks['objectStorage'] = { status: 'up' };
    } catch (error) {
      checks['objectStorage'] = { status: 'down', message: (error as Error).message };
    }

    const healthy = Object.values(checks).every((entry) => entry.status === 'up');
    if (!healthy) throw new ServiceUnavailableException({ status: 'degraded', checks });
    return { status: 'ok', checks };
  }
}
