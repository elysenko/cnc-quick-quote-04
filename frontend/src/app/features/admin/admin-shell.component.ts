import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { ConfigService } from '../../core/config.service';

interface AdminTab {
  key: string;
  label: string;
  route: string;
  /** URL prefix that lights this tab — `business` stays active across all of its sub-pages. */
  match: string;
}

/**
 * Parent route for `/admin/**`. Owns the console header, the tab strip and the
 * persistent "needs credentials" banner; every section renders into the outlet.
 */
@Component({
  selector: 'app-admin-shell',
  standalone: true,
  imports: [RouterLink, RouterOutlet],
  templateUrl: './admin-shell.component.html',
  styleUrl: './admin-shell.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminShellComponent {
  private readonly config = inject(ConfigService);
  private readonly router = inject(Router);

  readonly tabs: AdminTab[] = [
    { key: 'materials', label: 'Materials', route: '/admin/materials', match: '/admin/materials' },
    { key: 'pricing', label: 'Pricing', route: '/admin/pricing', match: '/admin/pricing' },
    { key: 'machine', label: 'Machine', route: '/admin/machine', match: '/admin/machine' },
    { key: 'business', label: 'Business', route: '/admin/business/branding', match: '/admin/business' },
    { key: 'settings', label: 'Settings', route: '/admin/settings', match: '/admin/settings' },
  ];

  readonly businessTabs: AdminTab[] = [
    { key: 'branding', label: 'Branding', route: '/admin/business/branding', match: '/admin/business/branding' },
    { key: 'payment', label: 'Payment', route: '/admin/business/payment', match: '/admin/business/payment' },
    { key: 'shipping', label: 'Shipping', route: '/admin/business/shipping', match: '/admin/business/shipping' },
  ];

  private readonly url = signal(this.router.url);

  readonly inBusiness = computed(() => this.url().startsWith('/admin/business'));

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.url.set(e.urlAfterRedirects));
  }

  isActive(tab: AdminTab): boolean {
    return this.url().startsWith(tab.match);
  }

  readonly unconfigured = computed(() => this.config.unconfigured());

  /** Labels of every entry still missing a credential, in registry order. */
  readonly unconfiguredLabels = computed(() =>
    this.unconfigured().map((setting) => setting.label).join(', '),
  );
}
