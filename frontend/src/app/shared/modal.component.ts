import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

/**
 * Presentational dialog. Pages open it from the `?modal=<name>` query param so
 * every dialog state is URL-addressable and can be linked to directly.
 */
@Component({
  selector: 'app-modal',
  standalone: true,
  templateUrl: './modal.component.html',
  styleUrl: './modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalComponent {
  @Input({ required: true }) heading = '';
  @Input() subheading = '';
  @Input() testid = 'modal';
  @Output() readonly dismissed = new EventEmitter<void>();
}
