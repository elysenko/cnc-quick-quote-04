import { Pipe, PipeTransform } from '@angular/core';

/** Integer cents to a display currency string. Money is never stored as a float. */
@Pipe({ name: 'money', standalone: true })
export class MoneyPipe implements PipeTransform {
  transform(cents: number | null | undefined, currency = 'USD'): string {
    const value = typeof cents === 'number' && Number.isFinite(cents) ? cents : 0;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(value / 100);
  }
}
