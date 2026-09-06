import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { BendDirection, BendLine, Drawing, Role } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { DxfParseError, parseDxf } from './dxf-parser';
import { StorageService } from './storage.service';
import { BendDto } from './drawings.dto';

export interface DrawingView {
  id: string;
  filename: string;
  sizeBytes: number;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  cutLengthMm: number;
  entityCount: number;
  createdAt: string;
  paths: number[][];
}

export function toDrawingView(drawing: Drawing): DrawingView {
  return {
    id: drawing.id,
    filename: drawing.filename,
    sizeBytes: drawing.sizeBytes,
    bbox: { minX: drawing.minX, minY: drawing.minY, maxX: drawing.maxX, maxY: drawing.maxY },
    cutLengthMm: drawing.cutLengthMm,
    entityCount: drawing.entityCount,
    createdAt: drawing.createdAt.toISOString(),
    paths: (drawing.paths as number[][]) ?? [],
  };
}

@Injectable()
export class DrawingsService {
  private readonly logger = new Logger(DrawingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Validation order matches the API contract exactly: extension, then size, then
   * parse — all of it before a single byte reaches object storage.
   */
  async upload(
    userId: string,
    file: { originalname: string; size: number; buffer: Buffer; mimetype?: string },
  ): Promise<DrawingView> {
    const machine = await this.settings.machine();

    const dot = file.originalname.lastIndexOf('.');
    const extension = dot === -1 ? '' : file.originalname.slice(dot).toLowerCase();
    const allowed = machine.allowedExtensions.map((entry) => entry.toLowerCase());
    if (!allowed.includes(extension)) {
      throw new UnprocessableEntityException(
        `“${file.originalname}” is not a supported drawing. Accepted formats: ${allowed.join(', ')}.`,
      );
    }

    if (file.size > machine.maxUploadBytes) {
      const limitMb = Math.round(machine.maxUploadBytes / (1024 * 1024));
      throw new UnprocessableEntityException(
        `“${file.originalname}” is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is ${limitMb} MB.`,
      );
    }

    let parsed;
    try {
      parsed = parseDxf(file.buffer);
    } catch (error) {
      if (error instanceof DxfParseError) throw new UnprocessableEntityException(error.message);
      throw new UnprocessableEntityException('That drawing could not be read. Re-export it as an ASCII DXF.');
    }

    const storageKey = `${userId}/${randomUUID()}${extension}`;
    await this.storage.put(storageKey, file.buffer, file.mimetype ?? 'application/dxf');

    const drawing = await this.prisma.drawing.create({
      data: {
        userId,
        filename: file.originalname,
        sizeBytes: file.size,
        storageKey,
        minX: parsed.bbox.minX,
        minY: parsed.bbox.minY,
        maxX: parsed.bbox.maxX,
        maxY: parsed.bbox.maxY,
        cutLengthMm: parsed.cutLengthMm,
        entityCount: parsed.entityCount,
        paths: parsed.paths,
      },
    });

    return toDrawingView(drawing);
  }

  async listMine(userId: string): Promise<DrawingView[]> {
    const rows = await this.prisma.drawing.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });
    return rows.map(toDrawingView);
  }

  /** Another customer's drawing is a 404, never a 403 — its existence is not disclosed. */
  async requireOwned(id: string, userId: string, role: Role): Promise<Drawing> {
    const drawing = await this.prisma.drawing.findUnique({ where: { id } });
    if (!drawing || (drawing.userId !== userId && role !== Role.ADMIN)) {
      throw new NotFoundException('That drawing could not be found.');
    }
    return drawing;
  }

  async downloadUrl(id: string, userId: string, role: Role): Promise<{ url: string }> {
    const drawing = await this.requireOwned(id, userId, role);
    return { url: await this.storage.presignedGet(drawing.storageKey) };
  }

  listBends(drawingId: string): Promise<BendLine[]> {
    return this.prisma.bendLine.findMany({
      where: { drawingId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createBend(drawingId: string, dto: BendDto): Promise<BendLine> {
    return this.prisma.bendLine.create({
      data: {
        drawingId,
        startX: dto.startX,
        startY: dto.startY,
        endX: dto.endX,
        endY: dto.endY,
        angleDeg: dto.angleDeg,
        direction: dto.direction as BendDirection,
      },
    });
  }

  async updateBend(drawingId: string, bendId: string, dto: Partial<BendDto>): Promise<BendLine> {
    const existing = await this.prisma.bendLine.findFirst({ where: { id: bendId, drawingId } });
    if (!existing) throw new NotFoundException('That bend line no longer exists.');
    return this.prisma.bendLine.update({
      where: { id: bendId },
      data: {
        startX: dto.startX ?? existing.startX,
        startY: dto.startY ?? existing.startY,
        endX: dto.endX ?? existing.endX,
        endY: dto.endY ?? existing.endY,
        angleDeg: dto.angleDeg ?? existing.angleDeg,
        direction: (dto.direction as BendDirection | undefined) ?? existing.direction,
      },
    });
  }

  async deleteBend(drawingId: string, bendId: string): Promise<void> {
    const deleted = await this.prisma.bendLine.deleteMany({ where: { id: bendId, drawingId } });
    if (deleted.count === 0) throw new NotFoundException('That bend line no longer exists.');
  }
}
