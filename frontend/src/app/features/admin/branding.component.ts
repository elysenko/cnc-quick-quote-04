import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrandingService } from '../../core/branding.service';
import { BusinessConfig } from '../../core/models';

/**
 * Business identity: the values behind `GET /api/branding`. Saving re-applies the
 * palette as CSS custom properties, so the shell re-themes without a reload.
 */
@Component({
  selector: 'app-admin-branding',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './branding.component.html',
  styleUrl: './branding.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminBrandingComponent implements OnDestroy {
  private readonly brandingService = inject(BrandingService);
  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly saved = signal(false);

  readonly companyName = signal('');
  readonly logoUrl = signal('');
  readonly primaryColor = signal('#000000');
  readonly accentColor = signal('#000000');
  readonly contactEmail = signal('');
  readonly contactPhone = signal('');
  readonly supportHours = signal('');
  readonly addressLine1 = signal('');
  readonly addressLine2 = signal('');
  readonly city = signal('');
  readonly region = signal('');
  readonly postalCode = signal('');
  readonly country = signal('');

  private readonly hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
  readonly primaryError = computed(() =>
    this.hex.test(this.primaryColor()) ? null : 'Use a hex colour such as #2563eb.',
  );
  readonly accentError = computed(() =>
    this.hex.test(this.accentColor()) ? null : 'Use a hex colour such as #f97316.',
  );
  readonly invalid = computed(() => this.primaryError() !== null || this.accentError() !== null);

  readonly saveError = signal<string | null>(null);
  readonly saving = signal(false);

  constructor() {
    void this.brandingService.load().then(() => this.reset());
  }

  reset(): void {
    const branding = this.brandingService.current();
    if (!branding) return;
    this.companyName.set(branding.companyName);
    this.logoUrl.set(branding.logoUrl);
    this.primaryColor.set(branding.primaryColor);
    this.accentColor.set(branding.accentColor);
    this.contactEmail.set(branding.contactEmail);
    this.contactPhone.set(branding.contactPhone);
    this.supportHours.set(branding.supportHours);
    this.addressLine1.set(branding.addressLine1);
    this.addressLine2.set(branding.addressLine2);
    this.city.set(branding.city);
    this.region.set(branding.region);
    this.postalCode.set(branding.postalCode);
    this.country.set(branding.country);
    this.saved.set(false);
  }

  async save(): Promise<void> {
    if (this.invalid() || this.saving()) return;
    const next: BusinessConfig = {
      companyName: this.companyName().trim(),
      logoUrl: this.logoUrl().trim(),
      primaryColor: this.primaryColor(),
      accentColor: this.accentColor(),
      contactEmail: this.contactEmail().trim(),
      contactPhone: this.contactPhone().trim(),
      supportHours: this.supportHours().trim(),
      addressLine1: this.addressLine1().trim(),
      addressLine2: this.addressLine2().trim(),
      city: this.city().trim(),
      region: this.region().trim(),
      postalCode: this.postalCode().trim(),
      country: this.country().trim(),
    };
    this.saving.set(true);
    this.saveError.set(null);
    try {
      await this.brandingService.save(next);
      this.flagSaved();
    } catch (error) {
      this.saveError.set((error as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  ngOnDestroy(): void {
    if (this.timer !== null) clearTimeout(this.timer);
  }

  private flagSaved(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.saved.set(true);
    this.timer = setTimeout(() => this.saved.set(false), 2600);
  }
}
