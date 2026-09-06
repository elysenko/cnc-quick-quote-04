import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Order, Quote, Role } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogService } from '../catalog/catalog.service';
import { SettingsService } from '../settings/settings.service';
import { NestResult } from '../quotes/nesting';
import { nextOrderNumber } from '../quotes/reference';
import { EmailService } from './email.service';

export interface OrderView {
  id: string;
  orderNumber: string;
  confirmationNumber: string;
  quoteId: string;
  email: string;
  itemSummary: string;
  shippingMethodName: string;
  shippingAddress: {
    line1: string;
    line2: string;
    city: string;
    region: string;
    postalCode: string;
    country: string;
  };
  estDeliveryDays: number;
  totalCents: number;
  status: Order['status'];
  createdAt: string;
}

export function toOrderView(order: Order): OrderView {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    confirmationNumber: order.confirmationNumber,
    quoteId: order.quoteId,
    email: order.email,
    itemSummary: order.itemSummary,
    shippingMethodName: order.shippingMethodName,
    shippingAddress: {
      line1: order.shipLine1,
      line2: order.shipLine2,
      city: order.shipCity,
      region: order.shipRegion,
      postalCode: order.shipPostalCode,
      country: order.shipCountry,
    },
    estDeliveryDays: order.estDeliveryDays,
    totalCents: order.totalCents,
    status: order.status,
    createdAt: order.createdAt.toISOString(),
  };
}

function confirmationCode(): string {
  const raw = randomBytes(4).toString('hex').toUpperCase();
  return `CNF-${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly settings: SettingsService,
    private readonly email: EmailService,
  ) {}

  /**
   * Fulfils a paid Stripe session. Idempotent on `stripeSessionId`: a redelivered
   * webhook returns the order already on file instead of creating a second one.
   */
  async fulfil(quote: Quote, stripeSessionId: string, email: string): Promise<Order> {
    const existing = await this.prisma.order.findUnique({ where: { stripeSessionId } });
    if (existing) return existing;

    const nesting = quote.nesting as unknown as NestResult;
    const method = quote.shippingMethodId
      ? await this.prisma.shippingMethod.findUnique({ where: { id: quote.shippingMethodId } })
      : null;
    const shippingCents =
      quote.shippingCents ?? (method ? CatalogService.rateFor(method, nesting?.sheets ?? 1) : 0);

    const order = await this.prisma.order.create({
      data: {
        orderNumber: await nextOrderNumber(this.prisma),
        confirmationNumber: confirmationCode(),
        quoteId: quote.id,
        userId: quote.userId,
        stripeSessionId,
        email,
        itemSummary: `${quote.quantity} × ${quote.drawingName} — ${quote.materialName}`,
        shippingMethodName: method?.name ?? 'Collection from the workshop',
        shipLine1: quote.shipLine1 ?? '',
        shipLine2: quote.shipLine2 ?? '',
        shipCity: quote.shipCity ?? '',
        shipRegion: quote.shipRegion ?? '',
        shipPostalCode: quote.shipPostalCode ?? '',
        shipCountry: quote.shipCountry ?? '',
        estDeliveryDays: method?.estDeliveryDays ?? 5,
        shippingCents,
        totalCents: quote.totalCents + shippingCents,
      },
    });

    // Fire-and-forget: the confirmation page must never wait on the mail provider.
    void this.sendConfirmation(order);
    return order;
  }

  private async sendConfirmation(order: Order): Promise<void> {
    try {
      const business = await this.settings.business();
      await this.email.sendOrderConfirmation(order, business);
    } catch (error) {
      this.logger.error(
        `Confirmation email for ${order.orderNumber} could not be dispatched: ${(error as Error).message}`,
      );
    }
  }

  async list(userId: string, role: Role): Promise<OrderView[]> {
    const rows = await this.prisma.order.findMany({
      where: role === Role.ADMIN ? {} : { userId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map(toOrderView);
  }

  /** Accepts the id, the order number or the Stripe session id, so the return URL resolves. */
  async requireVisible(id: string, userId: string, role: Role): Promise<Order> {
    const order = await this.prisma.order.findFirst({
      where: {
        OR: [{ id }, { orderNumber: id }, { stripeSessionId: id }],
      },
    });
    if (!order || (order.userId !== userId && role !== Role.ADMIN)) {
      throw new NotFoundException('That order could not be found.');
    }
    return order;
  }

  async getById(id: string, userId: string, role: Role): Promise<OrderView> {
    return toOrderView(await this.requireVisible(id, userId, role));
  }

  async receiptHtml(id: string, userId: string, role: Role): Promise<string> {
    const order = await this.requireVisible(id, userId, role);
    const business = await this.settings.business();
    return EmailService.renderHtml(order, business);
  }
}
