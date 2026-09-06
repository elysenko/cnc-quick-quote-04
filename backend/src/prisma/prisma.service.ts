import { Injectable, Logger, OnModuleInit, INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
    } catch (error) {
      // A cold database must not stop the API from booting: liveness (`GET
      // /api/health`) is documented to answer as long as the process is up, and
      // readiness (`GET /api/health/deep`) is what reports the outage. Prisma
      // reconnects lazily on the next query, so a later request recovers on its
      // own once Postgres is reachable.
      this.logger.warn(`database not ready at boot: ${(error as Error).message}`);
    }
  }

  enableShutdownHooks(app: INestApplication): void {
    this.$on('beforeExit' as never, async () => {
      await app.close();
    });
  }
}
