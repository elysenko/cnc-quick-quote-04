import {
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  Req,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { RateLimit } from '../common/rate-limit.guard';
import { CatalogService } from '../catalog/catalog.service';
import { NestResult } from '../quotes/nesting';
import { QuotesService } from '../quotes/quotes.service';
import { SettingsService } from '../settings/settings.service';
import { StripeService } from './stripe.service';

interface SessionResponse {
  url: string;
  sessionId: string;
}

@ApiTags('checkout')
@Controller('checkout')
export class CheckoutController {
  constructor(
    private readonly quotes: QuotesService,
    private readonly catalog: CatalogService,
    private readonly settings: SettingsService,
    private readonly stripe: StripeService,
  ) {}

  /**
   * Hands off to Stripe's hosted page. No order row is written here — the order
   * only exists once the signed webhook confirms the payment landed.
   */
  @Post(':quoteId/session')
  @HttpCode(200)
  @RateLimit({ bucket: 'checkout-session', limit: 20, windowSeconds: 300 })
  async createSession(
    @CurrentUser() user: JwtPayload,
    @Param('quoteId') quoteId: string,
    @Req() request: Request,
    @Body() body: { returnOrigin?: string },
  ): Promise<SessionResponse> {
    const quote = await this.quotes.requireOwned(quoteId, user.sub, user.role);

    if (!quote.shippingMethodId) {
      throw new UnprocessableEntityException(
        'Choose a delivery method before paying.',
      );
    }
    const method = await this.catalog.requireActiveShipping(quote.shippingMethodId);
    const nesting = quote.nesting as unknown as NestResult;
    const shippingCents = CatalogService.rateFor(method, nesting?.sheets ?? 1);

    const origin = this.originFor(request, body?.returnOrigin);
    const session = await this.stripe.createCheckoutSession({
      quoteId: quote.id,
      customerEmail: user.email,
      currency: (process.env.CURRENCY ?? 'usd').toLowerCase(),
      successUrl: `${origin}/orders/{CHECKOUT_SESSION_ID}/confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/checkout/${encodeURIComponent(quote.id)}/payment?cancelled=1`,
      lineItems: [
        {
          name: `${quote.quantity} × ${quote.drawingName}`,
          description: `${quote.materialName} — ${nesting?.sheets ?? 1} sheet(s)`,
          amountCents: quote.totalCents,
        },
        ...(shippingCents > 0
          ? [{ name: method.name, description: 'Delivery', amountCents: shippingCents }]
          : []),
      ],
    });

    if (!session.url) {
      throw new UnprocessableEntityException(
        'The payment provider did not return a checkout page. Please try again.',
      );
    }
    return { url: session.url, sessionId: session.id };
  }

  /** Prefers the browser's own origin so the return URL works behind any ingress host. */
  private originFor(request: Request, supplied?: string): string {
    const configured = process.env.PUBLIC_APP_URL?.trim();
    if (configured) return configured.replace(/\/+$/, '');
    if (supplied && /^https?:\/\//.test(supplied)) return supplied.replace(/\/+$/, '');
    const forwardedProto = String(request.headers['x-forwarded-proto'] ?? '').split(',')[0];
    const host = request.headers.host ?? 'localhost';
    return `${forwardedProto || request.protocol || 'http'}://${host}`;
  }

  /** Ping used by the payment screen to decide whether card payment is available. */
  @Post('availability')
  @HttpCode(200)
  async availability(): Promise<{ cardPaymentsEnabled: boolean; sandboxMode: boolean }> {
    const [key, payment] = await Promise.all([this.stripe.secretKey(), this.settings.payment()]);
    return { cardPaymentsEnabled: key !== null, sandboxMode: payment.sandboxMode };
  }
}
