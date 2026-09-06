import { Injectable, signal } from '@angular/core';
import { BusinessConfig } from './models';

/**
 * Branding is fetched once from `GET /api/branding` and applied as CSS custom
 * properties on :root. The defaults below are the fallback when branding is unset.
 */
@Injectable({ providedIn: 'root' })
export class BrandingService {
  readonly branding = signal<BusinessConfig[]>([
    {
      companyName: 'Halcyon Metalworks',
      logoUrl: '',
      primaryColor: '#2563eb',
      accentColor: '#f97316',
      contactEmail: 'quotes@halcyonmetalworks.com',
      contactPhone: '+1 (503) 555-0148',
      supportHours: 'Mon–Fri, 7:00–17:00 PT',
      addressLine1: '1420 Foundry Road',
      addressLine2: 'Building C',
      city: 'Portland',
      region: 'OR',
      postalCode: '97210',
      country: 'United States',
    },
  ]);

  /** The single active branding record, or null before it loads. */
  current(): BusinessConfig | null {
    return this.branding().at(0) ?? null;
  }

  apply(): void {
    const b = this.current();
    if (!b || typeof document === 'undefined') return;
    const root = document.documentElement;
    if (b.primaryColor) root.style.setProperty('--color-primary', b.primaryColor);
    if (b.accentColor) root.style.setProperty('--color-accent', b.accentColor);
  }
}
