import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { StripeEvent, StripeService } from './stripe.service';

const FULFIL_EVENTS = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
]);

/**
 * Stripe delivery endpoint. Unauthenticated by design — trust comes entirely from
 * the signature over the raw body, never from a session.
 */
@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly stripe: StripeService,
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  @Public()
  @Post('stripe')
  @HttpCode(200)
  async stripeWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ): Promise<{ received: boolean }> {
    const raw = request.rawBody;
    if (!raw) throw new BadRequestException('Missing request body.');

    const event = await this.stripe.constructEvent(raw, signature);
    if (!event) {
      // Log and change nothing — a bad signature is never trusted.
      this.logger.warn('Rejected a Stripe webhook with an invalid or missing signature.');
      throw new BadRequestException('Invalid signature.');
    }

    // The unique violation IS the "already processed" signal: concurrent redelivery
    // of the same event can only ever insert once.
    try {
      await this.prisma.webhookEvent.create({
        data: { stripeEventId: event.id, type: event.type },
      });
    } catch {
      this.logger.log(`Stripe event ${event.id} already processed; acknowledging.`);
      return { received: true };
    }

    if (FULFIL_EVENTS.has(event.type)) {
      await this.fulfil(event);
    }
    return { received: true };
  }

  private async fulfil(event: StripeEvent): Promise<void> {
    const object = event.data?.object ?? {};
    const sessionId = typeof object['id'] === 'string' ? (object['id'] as string) : null;
    if (!sessionId) return;

    // Re-retrieve rather than trusting the delivered payload's payment state.
    const session = await this.stripe.retrieveSession(sessionId);
    if (!session.payment_status || session.payment_status === 'unpaid') {
      this.logger.log(`Session ${sessionId} is still unpaid; no order created.`);
      return;
    }

    const quoteId = session.metadata?.['quoteId'];
    if (!quoteId) {
      this.logger.warn(`Session ${sessionId} carried no quote reference; nothing to fulfil.`);
      return;
    }

    const quote = await this.prisma.quote.findUnique({ where: { id: quoteId } });
    if (!quote) {
      this.logger.warn(`Session ${sessionId} referenced unknown quote ${quoteId}.`);
      return;
    }

    const email =
      session.customer_details?.email ?? session.customer_email ?? '';
    const order = await this.orders.fulfil(quote, sessionId, email);
    this.logger.log(`Order ${order.orderNumber} created from session ${sessionId}.`);
  }
}
