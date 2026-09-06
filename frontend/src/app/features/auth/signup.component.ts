import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './signup.component.html',
  styleUrls: ['./auth.css', './signup.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignupComponent {
  readonly auth = inject(AuthService);

  name = signal('');
  email = signal('');
  password = signal('');
  confirm = signal('');

  async submit(): Promise<void> {
    await this.auth.signup(this.name(), this.email(), this.password(), this.confirm());
  }
}
