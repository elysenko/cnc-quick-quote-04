import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { BusinessConfig } from './models';

/**
 * Branding is fetched from `GET /api/branding` (public, so /login themes itself too)
 * and applied as CSS custom properties on :root.
 */
@Injectable({ providedIn: 'root' })
export class BrandingService {
  private readonly api = inject(ApiService);

  readonly branding = signal<BusinessConfig[]>([]);
  readonly loaded = signal(false);

  private loading: Promise<void> | null = null;

  load(force = false): Promise<void> {
    if (this.loading && !force) return this.loading;
    if (this.loaded() && !force) return Promise.resolve();
    this.loading = this.api
      .get<BusinessConfig>('/branding')
      .then((business) => {
        this.branding.set([business]);
        this.loaded.set(true);
        this.apply();
      })
      .catch(() => {
        // Branding is decoration: a failure must never block the shell from rendering.
      })
      .finally(() => {
        this.loading = null;
      });
    return this.loading;
  }

  /** The single active branding record, or null before it loads. */
  current(): BusinessConfig | null {
    return this.branding().at(0) ?? null;
  }

  async save(next: BusinessConfig): Promise<void> {
    const saved = await this.api.put<BusinessConfig>('/admin/config/business', next);
    this.branding.set([saved]);
    this.loaded.set(true);
    this.apply();
  }

  apply(): void {
    const b = this.current();
    if (!b || typeof document === 'undefined') return;
    const root = document.documentElement;
    if (b.primaryColor) root.style.setProperty('--color-primary', b.primaryColor);
    if (b.accentColor) root.style.setProperty('--color-accent', b.accentColor);
  }
}
