import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogService } from '../../core/catalog.service';
import { ConfigService } from '../../core/config.service';
import { StatePanelComponent } from '../../shared/state-panel.component';
import { QuoteDraftService } from './quote-draft.service';

@Component({
  selector: 'app-material-step',
  standalone: true,
  imports: [RouterLink, StatePanelComponent],
  templateUrl: './material-step.component.html',
  styleUrl: './material-step.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaterialStepComponent {
  private readonly catalog = inject(CatalogService);
  private readonly config = inject(ConfigService);
  readonly draft = inject(QuoteDraftService);

  readonly materials = computed(() => this.catalog.activeMaterials());
  readonly machine = computed(() => this.config.machine());

  readonly quantityError = computed(() => {
    const { qtyMin, qtyMax } = this.machine();
    const qty = this.draft.quantity();
    if (!Number.isFinite(qty) || qty === 0) return 'Enter a quantity.';
    if (qty < qtyMin) return `Minimum order quantity is ${qtyMin}.`;
    if (qty > qtyMax) return `Maximum order quantity is ${qtyMax}.`;
    if (!Number.isInteger(qty)) return 'Quantity must be a whole number.';
    return null;
  });

  select(id: string): void {
    this.draft.materialId.set(id);
  }

  setQuantity(value: string): void {
    const parsed = Number.parseInt(value, 10);
    this.draft.quantity.set(Number.isNaN(parsed) ? 0 : parsed);
  }
}
