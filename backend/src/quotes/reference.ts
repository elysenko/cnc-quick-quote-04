import { PrismaService } from '../prisma/prisma.service';

/**
 * Monotonic, human-readable references (`QT-2026-0001`, `HM-100001`).
 *
 * The counter row is incremented in a single atomic UPDATE, so two concurrent
 * requests can never mint the same reference.
 */
export async function nextCount(prisma: PrismaService, name: string): Promise<number> {
  const row = await prisma.counter.upsert({
    where: { name },
    update: { value: { increment: 1 } },
    create: { name, value: 1 },
  });
  return row.value;
}

export async function nextReference(
  prisma: PrismaService,
  name: string,
  prefix: string,
): Promise<string> {
  const value = await nextCount(prisma, name);
  const year = new Date().getUTCFullYear();
  return `${prefix}-${year}-${String(value).padStart(4, '0')}`;
}

export async function nextOrderNumber(prisma: PrismaService): Promise<string> {
  const value = await nextCount(prisma, 'order');
  return `HM-${String(100000 + value)}`;
}
