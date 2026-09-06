import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ConfigService } from '../../core/config.service';
import { IntegrationSetting } from '../../core/models';

interface SettingsSection {
  kind: IntegrationSetting['kind'];
  title: string;
  hint: string;
  entries: IntegrationSetting[];
}

/**
 * Credential registry for provisioned services and third-party integrations.
 * Values are write-only: only the last four characters are ever echoed back.
 */
@Component({
  selector: 'app-admin-settings',
  standalone: true,
  imports: [],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSettingsComponent {
  private readonly config = inject(ConfigService);

  readonly settings = this.config.integrationSettings;

  readonly services = computed(() => this.settings().filter((s) => s.kind === 'service'));
  readonly integrations = computed(() => this.settings().filter((s) => s.kind === 'integration'));

  readonly sections = computed<SettingsSection[]>(() => [
    {
      kind: 'service',
      title: 'Provisioned services',
      hint: 'Platform-managed infrastructure. Quoting and uploads fail while these are unset.',
      entries: this.services(),
    },
    {
      kind: 'integration',
      title: 'Integrations',
      hint: 'Third-party APIs. A call to an unconfigured integration returns 503 rather than failing silently.',
      entries: this.integrations(),
    },
  ]);
  readonly total = computed(() => this.settings().length);
  readonly unconfiguredCount = computed(() => this.settings().filter((s) => !s.configured).length);

  /** Typed-but-unsaved credentials, keyed by env var name. Never persisted anywhere else. */
  private readonly entered = signal<Record<string, string>>({});

  entry(key: string): string {
    return this.entered()[key] ?? '';
  }

  setEntry(key: string, value: string): void {
    this.entered.update((map) => ({ ...map, [key]: value }));
  }

  save(key: string): void {
    const value = this.entry(key).trim();
    if (!value) return;
    const masked = `••••••••${value.slice(-4)}`;
    this.settings.update((list) =>
      list.map((s) => (s.key === key ? { ...s, configured: true, maskedValue: masked } : s)),
    );
    this.setEntry(key, '');
  }

  clear(key: string): void {
    this.settings.update((list) =>
      list.map((s) => (s.key === key ? { ...s, configured: false, maskedValue: '' } : s)),
    );
    this.setEntry(key, '');
  }
}
