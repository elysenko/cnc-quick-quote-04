import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Quote, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogService } from '../catalog/catalog.service';
import { SettingsService } from '../settings/settings.service';
import { NestResult, nest } from './nesting';
import { BreakdownLine, price } from './pricing';
import { CreateQuoteDto, QuoteShippingDto } from './quotes.dto';
import { nextReference } from './reference';

export interface QuoteView {
  id: string;
  drawingId: string;
  drawingName: string;
  materialId: string;
  materialName: string;
  quantity: number;
  cutLengthMm: number;
  bendCount: number;
  breakdown: BreakdownLine[];
  nesting: NestResult;
  totalCents: number;
  createdAt: string;
  shippingMethodId: string | null;
  shippingCents: number | null;
  shippingAddress: {
    line1: string;
    line2: string;
    city: string;
    region: string;
    postalCode: string;
    country: string;
  } | null;
}

export function toQuoteView(quote: Quote): QuoteView {
  const hasAddress = quote.shipLine1 !== null && quote.shipLine1 !== undefined;
  return {
    id: quote.id,
    drawingId: quote.drawingId,
    drawingName: quote.drawingName,
    materialId: quote.materialId,
    materialName: quote.materialName,
    quantity: quote.quantity,
    cutLengthMm: quote.cutLengthMm,
    bendCount: quote.bendCount,
    breakdown: (quote.breakdown as unknown as BreakdownLine[]) ?? [],
    nesting: quote.nesting as unknown as NestResult,
    totalCents: quote.totalCents,
    createdAt: quote.createdAt.toISOString(),
    shippingMethodId: quote.shippingMethodId,
    shippingCents: quote.shippingCents,
    shippingAddress: hasAddress
      ? {
          line1: quote.shipLine1 ?? '',
          line2: quote.shipLine2 ?? '',
          city: quote.shipCity ?? '',
          region: quote.shipRegion ?? '',
          postalCode: quote.shipPostalCode ?? '',
          country: quote.shipCountry ?? '',
        }
      : null,
  };
}

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly settings: SettingsService,
  ) {}

  /** Shared front half of quote creation and the nesting preview. */
  private async resolveInputs(userId: string, role: Role, dto: CreateQuoteDto) {
    const drawing = await this.prisma.drawing.findUnique({ where: { id: dto.drawingId } });
    if (!drawing || (drawing.userId !== userId && role !== Role.ADMIN)) {
      throw new NotFoundException('That drawing could not be found.');
    }

    const material = await this.catalog.requireActiveMaterial(dto.materialId);
    const machine = await this.settings.machine();

    const quantity = dto.quantity;
    if (!Number.isInteger(quantity) || quantity < machine.qtyMin) {
      throw new UnprocessableEntityException(
        `Minimum order quantity is ${machine.qtyMin}.`,
      );
    }
    if (quantity > machine.qtyMax) {
      throw new UnprocessableEntityException(
        `Maximum order quantity is ${machine.qtyMax}.`,
      );
    }

    const partW = drawing.maxX - drawing.minX;
    const partH = drawing.maxY - drawing.minY;
    const nesting = nest(partW, partH, quantity, material, machine);
    if (!nesting) {
      throw new UnprocessableEntityException(
        `This part is ${partW.toFixed(0)} × ${partH.toFixed(0)} mm and does not fit a ` +
          `${material.sheetWMm} × ${material.sheetHMm} mm sheet of ${material.name}.`,
      );
    }

    return { drawing, material, machine, nesting, quantity };
  }

  async previewNesting(userId: string, role: Role, dto: CreateQuoteDto): Promise<NestResult> {
    const { nesting } = await this.resolveInputs(userId, role, dto);
    return nesting;
  }

  /**
   * Prices a draft without writing a quote row, so the wizard's result step can be
   * revisited freely without minting a new reference each time.
   */
  async previewQuote(
    userId: string,
    role: Role,
    dto: CreateQuoteDto,
  ): Promise<{ nesting: NestResult; breakdown: BreakdownLine[]; totalCents: number; bendCount: number }> {
    const { drawing, material, nesting, quantity } = await this.resolveInputs(userId, role, dto);
    const pricing = await this.settings.pricing();
    const bendCount = await this.prisma.bendLine.count({ where: { drawingId: drawing.id } });
    const result = price(drawing.cutLengthMm, quantity, bendCount, nesting, material, pricing);
    return { nesting, breakdown: result.lines, totalCents: result.totalCents, bendCount };
  }

  async create(userId: string, role: Role, dto: CreateQuoteDto): Promise<QuoteView> {
    const { drawing, material, nesting, quantity } = await this.resolveInputs(userId, role, dto);
    const pricing = await this.settings.pricing();
    const bendCount = await this.prisma.bendLine.count({ where: { drawingId: drawing.id } });

    const result = price(drawing.cutLengthMm, quantity, bendCount, nesting, material, pricing);
    const id = await nextReference(this.prisma, 'quote', 'QT');

    const quote = await this.prisma.quote.create({
      data: {
        id,
        userId,
        drawingId: drawing.id,
        drawingName: drawing.filename,
        materialId: material.id,
        materialName: material.name,
        quantity,
        cutLengthMm: drawing.cutLengthMm,
        bendCount,
        breakdown: result.lines as unknown as object,
        nesting: nesting as unknown as object,
        // Frozen at creation: later admin pricing edits never move this total.
        pricingSnapshot: {
          costPerLinearFtCents: pricing.costPerLinearFtCents,
          setupFeeCents: pricing.setupFeeCents,
          handlingFeeCents: pricing.handlingFeeCents,
          minOrderCents: pricing.minOrderCents,
          costPerBendCents: pricing.costPerBendCents,
          materialCostMultiplier: material.costMultiplier,
        },
        totalCents: result.totalCents,
      },
    });

    return toQuoteView(quote);
  }

  async list(userId: string, role: Role): Promise<QuoteView[]> {
    const rows = await this.prisma.quote.findMany({
      where: role === Role.ADMIN ? {} : { userId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map(toQuoteView);
  }

  async requireOwned(id: string, userId: string, role: Role): Promise<Quote> {
    const quote = await this.prisma.quote.findUnique({ where: { id } });
    if (!quote || (quote.userId !== userId && role !== Role.ADMIN)) {
      throw new NotFoundException('That quote could not be found.');
    }
    return quote;
  }

  async getById(id: string, userId: string, role: Role): Promise<QuoteView> {
    return toQuoteView(await this.requireOwned(id, userId, role));
  }

  /**
   * Persists the delivery choice on the quote so the payment step (and a reload, or
   * a shared link) reads exactly what the customer picked rather than guessing.
   */
  async setShipping(
    id: string,
    userId: string,
    role: Role,
    dto: QuoteShippingDto,
  ): Promise<QuoteView> {
    const quote = await this.requireOwned(id, userId, role);
    const method = await this.catalog.requireActiveShipping(dto.shippingMethodId);
    const nesting = quote.nesting as unknown as NestResult;
    const shippingCents = CatalogService.rateFor(method, nesting?.sheets ?? 1);

    const updated = await this.prisma.quote.update({
      where: { id },
      data: {
        shippingMethodId: method.id,
        shippingCents,
        shipLine1: dto.line1,
        shipLine2: dto.line2 ?? '',
        shipCity: dto.city,
        shipRegion: dto.region,
        shipPostalCode: dto.postalCode,
        shipCountry: dto.country,
      },
    });
    return toQuoteView(updated);
  }
}
