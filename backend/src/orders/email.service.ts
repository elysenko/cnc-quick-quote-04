import { Injectable, Logger } from '@nestjs/common';
import { BusinessConfig, Order } from '@prisma/client';
import { RuntimeConfigService } from '../common/runtime-config.service';

const RESEND_API = 'https://api.resend.com/emails';
const SEND_TIMEOUT_MS = 8_000;

/**
 * Transactional email through the Resend REST API.
 *
 * Every send is best-effort: a failure is logged for retry and never propagates,
 * because a down mail provider must not roll back a paid order.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly runtime: RuntimeConfigService) {}

  async sendOrderConfirmation(order: Order, business: BusinessConfig): Promise<boolean> {
    const apiKey = await this.runtime.resolveFirst(
      'RESEND_API_RESEND_SDK_API_KEY',
      'RESEND_API_KEY',
    );
    if (!apiKey) {
      this.logger.warn(
        `Resend is not configured — confirmation email for ${order.orderNumber} was not sent.`,
      );
      return false;
    }

    const from = process.env.ORDER_EMAIL_FROM ?? 'orders@resend.dev';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
    try {
      const response = await fetch(RESEND_API, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [order.email],
          subject: `${business.companyName} — order ${order.orderNumber} confirmed`,
          html: EmailService.renderHtml(order, business),
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        this.logger.error(
          `Confirmation email for ${order.orderNumber} rejected by Resend (${response.status}); queued for retry.`,
        );
        return false;
      }
      return true;
    } catch (error) {
      this.logger.error(
        `Confirmation email for ${order.orderNumber} failed: ${(error as Error).message}; queued for retry.`,
      );
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  static renderHtml(order: Order, business: BusinessConfig): string {
    const money = (cents: number): string => `$${(cents / 100).toFixed(2)}`;
    const address = [
      order.shipLine1,
      order.shipLine2,
      [order.shipCity, order.shipRegion, order.shipPostalCode].filter(Boolean).join(' '),
      order.shipCountry,
    ]
      .filter((line) => line && line.trim().length > 0)
      .join('<br />');

    return `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#0f172a;margin:0;padding:24px;background:#f8fafc">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;border:1px solid #e2e8f0">
    <h1 style="margin:0 0 4px;font-size:20px;color:${business.primaryColor}">${business.companyName}</h1>
    <p style="margin:0 0 20px;color:#64748b">Your order is confirmed.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr><td style="padding:6px 0;color:#64748b">Order number</td><td style="text-align:right"><strong>${order.orderNumber}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#64748b">Confirmation</td><td style="text-align:right">${order.confirmationNumber}</td></tr>
      <tr><td style="padding:6px 0;color:#64748b">Items</td><td style="text-align:right">${order.itemSummary}</td></tr>
      <tr><td style="padding:6px 0;color:#64748b">Delivery</td><td style="text-align:right">${order.shippingMethodName} — approx. ${order.estDeliveryDays} days</td></tr>
      <tr><td style="padding:10px 0;border-top:1px solid #e2e8f0"><strong>Total paid</strong></td><td style="text-align:right;padding:10px 0;border-top:1px solid #e2e8f0"><strong>${money(order.totalCents)}</strong></td></tr>
    </table>
    <p style="margin:20px 0 4px;color:#64748b;font-size:13px">Shipping to</p>
    <p style="margin:0;font-size:14px">${address || 'Collection from the workshop'}</p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />
    <p style="margin:0;font-size:13px;color:#64748b">
      ${business.contactEmail || ''} ${business.contactPhone ? `· ${business.contactPhone}` : ''}<br />
      ${business.supportHours || ''}
    </p>
  </div>
</body></html>`;
  }
}
