import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from './core/auth.service';
import { BusinessConfig } from './core/models';
import { BrandingService } from './core/branding.service';

interface NavItem { label: string; short: string; route: string; glyph: string; adminOnly: boolean; }

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  private readonly router = inject(Router);
  private readonly branding = inject(BrandingService);
  readonly auth = inject(AuthService);

  private readonly url = signal(this.router.url);

  readonly business = computed<BusinessConfig | null>(() => this.branding.branding().at(0) ?? null);

  /** Auth screens render standalone — no shell chrome around them. */
  readonly chromeless = computed(() => /^\/(login|signup)\b/.test(this.url()));

  readonly navItems: NavItem[] = [
    { label: 'New quote', short: 'Quote', route: '/quote/new/upload', glyph: '＋', adminOnly: false },
    { label: 'My quotes', short: 'Quotes', route: '/quotes', glyph: '▤', adminOnly: false },
    { label: 'Orders', short: 'Orders', route: '/orders', glyph: '✦', adminOnly: false },
    { label: 'Admin console', short: 'Admin', route: '/admin/materials', glyph: '⚙', adminOnly: true },
  ];

  readonly visibleNav = computed(() =>
    this.navItems.filter((item) => !item.adminOnly || this.auth.isAdmin()),
  );

  readonly initials = computed(() => {
    const user = this.auth.user();
    const source = user?.name || user?.email || '';
    const parts = source.split(/[\s.@]+/).filter(Boolean).slice(0, 2);
    return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '·';
  });

  constructor() {
    this.branding.apply();
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.url.set(e.urlAfterRedirects));
  }
}
