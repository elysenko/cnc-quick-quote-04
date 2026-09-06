import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { Order, Quote } from './models';

/** `GET /api/quotes`, `GET /api/quotes/:id`, `GET /api/orders`, `GET /api/orders/:id`. */
@Injectable({ providedIn: 'root' })
export class OrdersService {
  private readonly api = inject(ApiService);

  readonly quotes = signal<Quote[]>([]);
  readonly orders = signal<Order[]>([]);

  readonly quotesLoading = signal(false);
  readonly quotesError = signal<string | null>(null);
  readonly ordersLoading = signal(false);
  readonly ordersError = signal<string | null>(null);

  async loadQuotes(): Promise<void> {
    this.quotesLoading.set(true);
    this.quotesError.set(null);
    try {
      this.quotes.set(await this.api.get<Quote[]>('/quotes'));
    } catch (error) {
      this.quotesError.set((error as Error).message);
    } finally {
      this.quotesLoading.set(false);
    }
  }

  async loadOrders(): Promise<void> {
    this.ordersLoading.set(true);
    this.ordersError.set(null);
    try {
      this.orders.set(await this.api.get<Order[]>('/orders'));
    } catch (error) {
      this.ordersError.set((error as Error).message);
    } finally {
      this.ordersLoading.set(false);
    }
  }

  /**
   * Fetches one quote and folds it into the cache, so a deep link to
   * `/quotes/:id` or `/checkout/:id/review` resolves without loading the whole list.
   */
  async fetchQuote(id: string): Promise<Quote | null> {
    if (!id) return null;
    try {
      const quote = await this.api.get<Quote>(`/quotes/${encodeURIComponent(id)}`);
      this.quotes.update((list) => [quote, ...list.filter((q) => q.id !== quote.id)]);
      return quote;
    } catch {
      return null;
    }
  }

  async fetchOrder(id: string): Promise<Order | null> {
    if (!id) return null;
    try {
      const order = await this.api.get<Order>(`/orders/${encodeURIComponent(id)}`);
      this.orders.update((list) => [order, ...list.filter((o) => o.id !== order.id)]);
      return order;
    } catch {
      return null;
    }
  }

  addQuote(quote: Quote): void {
    this.quotes.update((list) => [quote, ...list.filter((q) => q.id !== quote.id)]);
  }

  quoteById(id: string): Quote | null {
    return this.quotes().find((q) => q.id === id) ?? null;
  }

  orderById(id: string): Order | null {
    return this.orders().find((o) => o.id === id || o.orderNumber === id) ?? null;
  }

  /** Printable receipt for the confirmation screen's download link. */
  receiptUrl(orderId: string): string {
    return `/api/orders/${encodeURIComponent(orderId)}/receipt`;
  }
}
