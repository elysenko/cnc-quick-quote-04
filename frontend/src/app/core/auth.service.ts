import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ACCESS_TOKEN_KEY, ApiError, ApiService, REFRESH_TOKEN_KEY } from './api.service';
import { SessionUser } from './models';
import { readJson, readRaw, removeKeys, writeJson, writeRaw } from './storage';

const USER_KEY = 'user';

/** The authenticated landing screen. Used by login, the preview shortcut and guards. */
export const HOME_ROUTE = '/quote/new/upload';

interface AuthResponse {
  user: SessionUser;
  accessToken: string;
  refreshToken: string;
}

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
  private readonly api = inject(ApiService);

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
   * Restores a session from browser storage, then revalidates it against the API.
   * Anything unrecognised is cleared and ignored — a bad value must never throw,
   * because that would blank the page.
   */
  private restore(): void {
    let restored: SessionUser | null = null;
    try {
      restored = readJson<SessionUser>(USER_KEY, isSessionUser);
    } catch {
      restored = null;
    }
    if (!restored) {
      removeKeys(USER_KEY, ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY);
      // In the static preview there is no API to authenticate against, so a cold
      // load of an authenticated route renders that screen rather than bouncing
      // to /login. /login itself stays reachable and never redirects.
      if (COLOSSUS_PREVIEW) restored = this.demoUser();
    }
    this._user.set(restored);
    if (restored && !COLOSSUS_PREVIEW) void this.revalidate();
  }

  /** Confirms the stored session is still real; a revoked account is signed out. */
  private async revalidate(): Promise<void> {
    try {
      const user = await this.api.get<SessionUser>('/auth/me');
      this._user.set(user);
      writeJson(USER_KEY, user);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) this.clearSession();
    }
  }

  private demoUser(): SessionUser {
    return { id: 'usr_demo', email: 'demo.customer@example.com', name: 'Dana Reyes', role: 'ADMIN' };
  }

  private persist(result: AuthResponse): void {
    writeJson(USER_KEY, result.user);
    writeRaw(ACCESS_TOKEN_KEY, result.accessToken);
    writeRaw(REFRESH_TOKEN_KEY, result.refreshToken);
    this._user.set(result.user);
    this.error.set(null);
  }

  private clearSession(): void {
    removeKeys(USER_KEY, ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY);
    this._user.set(null);
  }

  /** Seeds the signed-in state directly and lands on the authenticated home. No credentials needed. */
  previewSignIn(): void {
    if (!COLOSSUS_PREVIEW) return;
    writeJson(USER_KEY, this.demoUser());
    this._user.set(this.demoUser());
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
      writeJson(USER_KEY, { ...this.demoUser(), email: email.trim() });
      this._user.set({ ...this.demoUser(), email: email.trim() });
      void this.router.navigateByUrl(HOME_ROUTE);
      return;
    }

    this.pending.set(true);
    try {
      const result = await this.api.post<AuthResponse>('/auth/login', {
        email: email.trim(),
        password,
      });
      this.persist(result);
      void this.router.navigateByUrl(this.returnUrl());
    } catch (error) {
      this.error.set(
        error instanceof ApiError && error.status !== 401
          ? error.message
          : 'Email or password is incorrect.',
      );
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
      const user = { ...this.demoUser(), name: name.trim(), email: email.trim() };
      writeJson(USER_KEY, user);
      this._user.set(user);
      void this.router.navigateByUrl(HOME_ROUTE);
      return;
    }

    this.pending.set(true);
    try {
      const result = await this.api.post<AuthResponse>('/auth/register', {
        name: name.trim(),
        email: email.trim(),
        password,
      });
      this.persist(result);
      void this.router.navigateByUrl(HOME_ROUTE);
    } catch (error) {
      this.error.set(
        error instanceof ApiError
          ? error.message
          : 'That email address is already registered.',
      );
    } finally {
      this.pending.set(false);
    }
  }

  logout(): void {
    // Revoke server-side, but never block the redirect on it.
    if (!COLOSSUS_PREVIEW) {
      void this.api
        .post('/auth/logout', { refreshToken: readRaw(REFRESH_TOKEN_KEY) })
        .catch(() => undefined);
    }
    this.clearSession();
    void this.router.navigateByUrl('/login');
  }

  /** Honours `?returnUrl=` set by the auth guard, falling back to the wizard. */
  private returnUrl(): string {
    if (typeof location === 'undefined') return HOME_ROUTE;
    const requested = new URLSearchParams(location.search).get('returnUrl');
    return requested && requested.startsWith('/') ? requested : HOME_ROUTE;
  }
}
