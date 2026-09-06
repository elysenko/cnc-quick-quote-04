import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { CatalogService } from '../../core/catalog.service';
import { Material } from '../../core/models';
import { ModalComponent } from '../../shared/modal.component';
import { StatePanelComponent } from '../../shared/state-panel.component';

interface MaterialForm {
  name: string;
  thicknessMm: number;
  sheetWMm: number;
  sheetHMm: number;
  costMultiplier: number;
  isActive: boolean;
}

type NumericField = 'thicknessMm' | 'sheetWMm' | 'sheetHMm' | 'costMultiplier';

const BLANK: MaterialForm = {
  name: '',
  thicknessMm: 1.6,
  sheetWMm: 1250,
  sheetHMm: 2500,
  costMultiplier: 1,
  isActive: true,
};

/** Stock list CRUD. Create, edit and delete are all `?modal=` addressed so they deep-link. */
@Component({
  selector: 'app-admin-materials',
  standalone: true,
  imports: [ModalComponent, StatePanelComponent],
  templateUrl: './materials.component.html',
  styleUrl: './materials.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminMaterialsComponent {
  private readonly catalog = inject(CatalogService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly materials = this.catalog.materials;
  readonly loading = this.catalog.loading;
  readonly loadError = this.catalog.loadError;
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);

  constructor() {
    // Admin read includes inactive rows so they can be switched back on.
    void this.catalog.loadAllMaterials();
  }

  private readonly params = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  /** `new` (or `create`), `edit` and `delete` all come straight off the URL. */
  readonly mode = computed(() => {
    const modal = this.params().get('modal');
    if (modal === 'new' || modal === 'create') return 'new';
    if (modal === 'edit') return 'edit';
    if (modal === 'delete') return 'delete';
    return null;
  });

  readonly targetId = computed(() => this.params().get('id'));
  readonly target = computed(
    () => this.materials().find((m) => m.id === this.targetId()) ?? null,
  );

  /** Unsaved edits; null means "show the row as stored" so deep links populate too. */
  private readonly draft = signal<MaterialForm | null>(null);

  readonly form = computed<MaterialForm>(() => {
    const draft = this.draft();
    if (draft) return draft;
    const editing = this.mode() === 'edit' ? this.target() : null;
    return editing ? { ...editing } : { ...BLANK };
  });

  readonly formError = computed<string | null>(() => {
    const form = this.form();
    if (!form.name.trim()) return 'Give the material a name, e.g. "Mild steel 2.0 mm".';
    if (!(form.thicknessMm > 0)) return 'Thickness must be greater than 0 mm.';
    if (!(form.sheetWMm > 0) || !(form.sheetHMm > 0)) return 'Sheet width and height must be greater than 0 mm.';
    if (!(form.costMultiplier > 0)) return 'Cost multiplier must be greater than 0.';
    return null;
  });

  patch(part: Partial<MaterialForm>): void {
    this.draft.set({ ...this.form(), ...part });
  }

  patchNumber(field: NumericField, value: string): void {
    const parsed = Number.parseFloat(value);
    const amount = Number.isNaN(parsed) ? 0 : parsed;
    if (field === 'thicknessMm') this.patch({ thicknessMm: amount });
    else if (field === 'sheetWMm') this.patch({ sheetWMm: amount });
    else if (field === 'sheetHMm') this.patch({ sheetHMm: amount });
    else this.patch({ costMultiplier: amount });
  }

  openNew(): void {
    this.draft.set({ ...BLANK });
    void this.setParams('new', null);
  }

  openEdit(material: Material): void {
    this.draft.set({ ...material });
    void this.setParams('edit', material.id);
  }

  openDelete(material: Material): void {
    this.draft.set(null);
    void this.setParams('delete', material.id);
  }

  close(): void {
    this.draft.set(null);
    void this.setParams(null, null);
  }

  async save(): Promise<void> {
    if (this.formError() || this.saving()) return;
    const form = this.form();
    const id = this.targetId();
    this.saving.set(true);
    this.saveError.set(null);
    try {
      if (this.mode() === 'edit' && id) await this.catalog.updateMaterial(id, form);
      else await this.catalog.createMaterial(form);
      this.close();
    } catch (error) {
      this.saveError.set((error as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  async confirmDelete(): Promise<void> {
    const id = this.targetId();
    if (!id || this.saving()) return;
    this.saving.set(true);
    this.saveError.set(null);
    try {
      await this.catalog.deleteMaterial(id);
      this.close();
    } catch (error) {
      this.saveError.set((error as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  private setParams(modal: string | null, id: string | null): Promise<boolean> {
    return this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { modal, id },
      queryParamsHandling: 'merge',
    });
  }
}
