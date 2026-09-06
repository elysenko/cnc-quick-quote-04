import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { SessionUser } from './models';
import { readJson, removeKeys, writeJson } from './storage';

const USER_KEY = 'user';
const TOKEN_KEY = 'access_token';

/** The authenticated landing screen. Used by login, the preview shortcut and guards. */
export const HOME_ROUTE = '/quote/new/upload';

function isSessionUser(value: unknown): value is SessionUser {
  if (typeof value !== 'object' || value === null) return false;
  const u = value as Record<string, unknown>;
  return (
    typeof u['id'] === 'string' &&
    typeof u['email'] === 'string' &&
    (u['role'] === 'USER' || u['role'] === 'MANAGER' || u['role'] === 'ADMIN')
  );
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);

  private readonly _user = signal<SessionUser | null>(null);

  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);
  readonly isAdmin = computed(() => this._user()?.role === 'ADMIN');

  readonly pending = signal(false);
  readonly error = signal<string | null>(null);

  /** Preview-only affordance rendered by the login/signup screens. */
  readonly previewShortcut = COLOSSUS_PREVIEW ? 'Skip login — Demo Mode' : null;

  constructor() {
    this.restore();
  }

  /**
   * Restores a session from browser storage. Anything unrecognised is cleared and
   * ignored — a bad value must never throw, because that would blank the page.
   */
  private restore(): void {
    let restored: SessionUser | null = null;
    try {
      restored = readJson<SessionUser>(USER_KEY, isSessionUser);
    } catch {
      restored = null;
    }
    if (!restored) {
      removeKeys(USER_KEY, TOKEN_KEY);
      // In the static preview there is no API to authenticate against, so a cold
      // load of an authenticated route renders that screen rather than bouncing
      // to /login. /login itself stays reachable and never redirects.
      if (COLOSSUS_PREVIEW) restored = this.demoUser();
    }
    this._user.set(restored);
  }

  private demoUser(): SessionUser {
    return { id: 'usr_demo', email: 'demo.customer@example.com', name: 'Dana Reyes', role: 'ADMIN' };
  }

  private persist(user: SessionUser): void {
    writeJson(USER_KEY, user);
    writeJson(TOKEN_KEY, `preview.${user.id}`);
    this._user.set(user);
    this.error.set(null);
  }

  /** Seeds the signed-in state directly and lands on the authenticated home. No credentials needed. */
  previewSignIn(): void {
    if (!COLOSSUS_PREVIEW) return;
    this.persist(this.demoUser());
    void this.router.navigateByUrl(HOME_ROUTE);
  }

  async login(email: string, password: string): Promise<void> {
    this.error.set(null);
    if (!email.trim() || !password.trim()) {
      this.error.set('Enter your email address and password.');
      return;
    }
    if (!EMAIL_SHAPE.test(email.trim())) {
      this.error.set('Enter a valid email address.');
      return;
    }

    if (COLOSSUS_PREVIEW) {
      // Resolved locally and synchronously: the preview host has no API server,
      // so any network call here would strand the reviewer on this screen.
      this.persist({ ...this.demoUser(), email: email.trim() });
      void this.router.navigateByUrl(HOME_ROUTE);
      return;
    }

    this.pending.set(true);
    try {
      const user = await this.authenticate(email.trim(), password);
      this.persist(user);
      void this.router.navigateByUrl(HOME_ROUTE);
    } catch {
      this.error.set('Email or password is incorrect.');
    } finally {
      this.pending.set(false);
    }
  }

  async signup(name: string, email: string, password: string, confirm: string): Promise<void> {
    this.error.set(null);
    if (!name.trim() || !email.trim() || !password.trim()) {
      this.error.set('Fill in every field to create your account.');
      return;
    }
    if (!EMAIL_SHAPE.test(email.trim())) {
      this.error.set('Enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      this.error.set('Choose a password of at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      this.error.set('The two passwords do not match.');
      return;
    }

    if (COLOSSUS_PREVIEW) {
      this.persist({ ...this.demoUser(), name: name.trim(), email: email.trim() });
      void this.router.navigateByUrl(HOME_ROUTE);
      return;
    }

    this.pending.set(true);
    try {
      const user = await this.register(name.trim(), email.trim(), password);
      this.persist(user);
      void this.router.navigateByUrl(HOME_ROUTE);
    } catch {
      this.error.set('That email address is already registered.');
    } finally {
      this.pending.set(false);
    }
  }

  logout(): void {
    removeKeys(USER_KEY, TOKEN_KEY);
    this._user.set(null);
    void this.router.navigateByUrl('/login');
  }

  /** Replaced by the service layer with the real `auth.login` tRPC call. */
  private authenticate(email: string, _password: string): Promise<SessionUser> {
    return Promise.reject(new Error(`auth.login not wired for ${email}`));
  }

  /** Replaced by the service layer with the real `auth.register` tRPC call. */
  private register(name: string, email: string, _password: string): Promise<SessionUser> {
    return Promise.reject(new Error(`auth.register not wired for ${name} <${email}>`));
  }
}
