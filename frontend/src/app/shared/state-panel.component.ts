import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

export type PanelState = 'loading' | 'empty' | 'error' | 'ready';

/** Shared loading / empty / error placeholder reused by every list and detail screen. */
@Component({
  selector: 'app-state-panel',
  standalone: true,
  templateUrl: './state-panel.component.html',
  styleUrl: './state-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatePanelComponent {
  @Input({ required: true }) state: PanelState = 'ready';
  @Input() heading = '';
  @Input() message = '';
  @Input() testid = 'state';
}
