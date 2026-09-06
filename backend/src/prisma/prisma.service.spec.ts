import { PrismaService } from './prisma.service';

/**
 * Liveness (`GET /api/health`) is documented to answer "as long as the process
 * is up ... never touches a backing service". That promise only holds if the
 * app can finish bootstrapping while Postgres is down, so `onModuleInit` must
 * swallow the connection error the way `StorageService` swallows MinIO's.
 */
describe('PrismaService.onModuleInit()', () => {
  it('resolves instead of crashing the app when the database is unreachable', async () => {
    const service = new PrismaService();
    const failure = new Error('P1001: Can\'t reach database server');
    const connect = jest
      .spyOn(service, '$connect')
      .mockRejectedValue(failure as never);
    const warn = jest
      .spyOn((service as unknown as { logger: { warn: (m: string) => void } }).logger, 'warn')
      .mockImplementation(() => undefined);

    await expect(service.onModuleInit()).resolves.toBeUndefined();

    expect(connect).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('P1001'));
  });

  it('connects normally when the database is reachable', async () => {
    const service = new PrismaService();
    const connect = jest.spyOn(service, '$connect').mockResolvedValue(undefined as never);

    await expect(service.onModuleInit()).resolves.toBeUndefined();

    expect(connect).toHaveBeenCalledTimes(1);
  });
});
