import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { readRaw } from './storage';

/** Every backend route is served under this prefix and proxied through by nginx. */
export const API_BASE = '/api';

export const ACCESS_TOKEN_KEY = 'access_token';
export const REFRESH_TOKEN_KEY = 'refresh_token';

/** A failed API call, carrying the server's own customer-readable message. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const FALLBACK_MESSAGES: Record<number, string> = {
  0: 'The service is unreachable. Check your connection and try again.',
  401: 'Your session has expired. Sign in again.',
  403: 'You do not have permission to do that.',
  404: 'That record could not be found.',
  429: 'Too many requests. Give it a moment and try again.',
  502: 'An upstream service did not respond. Please try again.',
  503: 'That service is not configured yet.',
};

/** Lifts the API's `{ message }` body out of an HttpErrorResponse. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof HttpErrorResponse) {
    const body = error.error as { message?: string | string[] } | string | null;
    let message: string | undefined;
    if (typeof body === 'string') message = body;
    else if (body && typeof body === 'object') {
      message = Array.isArray(body.message) ? body.message.join(' ') : body.message;
    }
    return new ApiError(
      error.status,
      message?.trim() ||
        FALLBACK_MESSAGES[error.status] ||
        'Something went wrong. Please try again.',
    );
  }
  return new ApiError(0, FALLBACK_MESSAGES[0]);
}

/**
 * Thin typed wrapper over HttpClient. Everything returns a promise so components
 * can `await` in an effect without threading observables through the templates.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  get accessToken(): string | null {
    return readRaw(ACCESS_TOKEN_KEY);
  }

  async get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
    return this.run(
      this.http.get<T>(`${API_BASE}${path}`, {
        params: ApiService.toParams(params),
      }),
    );
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.run(this.http.post<T>(`${API_BASE}${path}`, body ?? {}));
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return this.run(this.http.put<T>(`${API_BASE}${path}`, body ?? {}));
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return this.run(this.http.patch<T>(`${API_BASE}${path}`, body ?? {}));
  }

  async delete<T>(path: string): Promise<T> {
    return this.run(this.http.delete<T>(`${API_BASE}${path}`));
  }

  /** Multipart upload — the browser sets its own boundary, so no Content-Type here. */
  async upload<T>(path: string, field: string, file: File): Promise<T> {
    const form = new FormData();
    form.append(field, file, file.name);
    return this.run(this.http.post<T>(`${API_BASE}${path}`, form));
  }

  private async run<T>(source: ReturnType<HttpClient['get']>): Promise<T> {
    try {
      return (await firstValueFrom(source)) as T;
    } catch (error) {
      throw toApiError(error);
    }
  }

  private static toParams(
    params?: Record<string, string | number>,
  ): Record<string, string> | undefined {
    if (!params) return undefined;
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(params)) out[key] = String(value);
    return out;
  }
}
