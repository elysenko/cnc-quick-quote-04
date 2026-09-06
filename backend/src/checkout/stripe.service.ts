import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ServiceUnconfiguredError } from '../common/errors';
import { RuntimeConfigService } from '../common/runtime-config.service';
import { SettingsService } from '../settings/settings.service';

const STRIPE_API = 'https://api.stripe.com/v1';
const STRIPE_TIMEOUT_MS = 12_000;
/** Stripe's own tolerance for webhook replay: signatures older than this are rejected. */
const SIGNATURE_TOLERANCE_SECONDS = 300;

export interface CheckoutLineItem {
  name: string;
  description: string;
  amountCents: number;
}

export interface StripeSession {
  id: string;
  url: string | null;
  payment_status?: string;
  status?: string;
  customer_email?: string | null;
  customer_details?: { email?: string | null } | null;
  metadata?: Record<string, string>;
}

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

/**
 * Thin Stripe client over the REST API using the platform runtime (global fetch) —
 * no SDK, so there is no blocking network client sitting on the event loop.
 */
@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);

  constructor(
    private readonly runtime: RuntimeConfigService,
    private readonly settings: SettingsService,
  ) {}

  /** Env wins; the admin console's stored key is the fallback. Null means unconfigured. */
  async secretKey(): Promise<string | null> {
    const fromEnv = await this.runtime.resolveFirst(
      'STRIPE_PYTHON_SDK_STRIPECLIENT_V15_6_API_KEY',
      'STRIPE_SECRET_KEY',
    );
    if (fromEnv) return fromEnv;
    const stored = (await this.settings.payment()).stripeSecretKey.trim();
    return stored || null;
  }

  async webhookSecret(): Promise<string | null> {
    const fromEnv = process.env.STRIPE_WEBHOOK_SECRET?.trim();
    if (fromEnv) return fromEnv;
    const stored = (await this.settings.payment()).stripeWebhookSecret.trim();
    return stored || null;
  }

  private async requireSecretKey(): Promise<string> {
    const key = await this.secretKey();
    if (!key) {
      throw new ServiceUnconfiguredError(
        'Card payments',
        'An administrator must add the Stripe secret key under Admin → Business → Payment before orders can be paid.',
      );
    }
    return key;
  }

  async createCheckoutSession(params: {
    quoteId: string;
    customerEmail: string;
    successUrl: string;
    cancelUrl: string;
    lineItems: CheckoutLineItem[];
    currency: string;
  }): Promise<StripeSession> {
    const key = await this.requireSecretKey();

    const form = new URLSearchParams();
    form.set('mode', 'payment');
    form.set('success_url', params.successUrl);
    form.set('cancel_url', params.cancelUrl);
    form.set('customer_email', params.customerEmail);
    form.set('client_reference_id', params.quoteId);
    form.set('metadata[quoteId]', params.quoteId);
    params.lineItems.forEach((item, index) => {
      form.set(`line_items[${index}][quantity]`, '1');
      form.set(`line_items[${index}][price_data][currency]`, params.currency);
      form.set(`line_items[${index}][price_data][unit_amount]`, String(item.amountCents));
      form.set(`line_items[${index}][price_data][product_data][name]`, item.name);
      if (item.description) {
        form.set(`line_items[${index}][price_data][product_data][description]`, item.description);
      }
    });

    return this.request<StripeSession>('POST', '/checkout/sessions', key, form);
  }

  async retrieveSession(sessionId: string): Promise<StripeSession> {
    const key = await this.requireSecretKey();
    return this.request<StripeSession>('GET', `/checkout/sessions/${sessionId}`, key);
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    key: string,
    body?: URLSearchParams,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), STRIPE_TIMEOUT_MS);
    try {
      const response = await fetch(`${STRIPE_API}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body?.toString(),
        signal: controller.signal,
      });
      const payload = (await response.json()) as T & { error?: { message?: string } };
      if (!response.ok) {
        const message = payload?.error?.message ?? `Stripe returned ${response.status}.`;
        this.logger.error(`Stripe ${method} ${path} failed: ${message}`);
        // 502, never 500: the failure is upstream and the customer should retry.
        throw new BadGatewayException(
          `The payment provider could not be reached (${message}). No charge was made — please try again.`,
        );
      }
      return payload;
    } catch (error) {
      if (error instanceof BadGatewayException || error instanceof ServiceUnconfiguredError) throw error;
      this.logger.error(`Stripe ${method} ${path} errored: ${(error as Error).message}`);
      throw new BadGatewayException(
        'The payment provider did not respond. No charge was made — please try again in a moment.',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Verifies a `Stripe-Signature` header against the raw request body. Returns null
   * for anything that fails — the caller answers 400 and changes no state.
   */
  async constructEvent(rawBody: Buffer, signatureHeader: string | undefined): Promise<StripeEvent | null> {
    const secret = await this.webhookSecret();
    if (!secret || !signatureHeader) return null;

    const parts = new Map<string, string>();
    for (const segment of signatureHeader.split(',')) {
      const [name, value] = segment.split('=');
      if (name && value && !parts.has(name.trim())) parts.set(name.trim(), value.trim());
    }
    const timestamp = parts.get('t');
    const provided = parts.get('v1');
    if (!timestamp || !provided) return null;

    const age = Math.abs(Math.floor(Date.now() / 1000) - Number.parseInt(timestamp, 10));
    if (!Number.isFinite(age) || age > SIGNATURE_TOLERANCE_SECONDS) return null;

    const expected = createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody.toString('utf8')}`)
      .digest('hex');
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(provided, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    try {
      return JSON.parse(rawBody.toString('utf8')) as StripeEvent;
    } catch {
      return null;
    }
  }
}
