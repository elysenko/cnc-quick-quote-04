import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { ACCESS_TOKEN_KEY, API_BASE, REFRESH_TOKEN_KEY } from './api.service';
import { readRaw, removeKeys, writeRaw } from './storage';

/** Routes that must never carry a bearer token or trigger a refresh. */
const PUBLIC_PATHS = [
  `${API_BASE}/auth/login`,
  `${API_BASE}/auth/register`,
  `${API_BASE}/auth/refresh`,
  `${API_BASE}/branding`,
  `${API_BASE}/health`,
];

function isPublic(url: string): boolean {
  return PUBLIC_PATHS.some((path) => url.startsWith(path));
}

function withToken<T>(request: HttpRequest<T>, token: string): HttpRequest<T> {
  return request.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

/**
 * Exchanges the stored refresh handle for a new access token.
 *
 * Uses `fetch` rather than HttpClient so the call cannot re-enter this interceptor
 * and recurse. A single in-flight promise is shared, so a burst of parallel 401s
 * refreshes once rather than once per request.
 */
let inFlightRefresh: Promise<string | null> | null = null;

function refreshAccessToken(): Promise<string | null> {
  if (inFlightRefresh) return inFlightRefresh;

  const refreshToken = readRaw(REFRESH_TOKEN_KEY);
  if (!refreshToken) return Promise.resolve(null);

  inFlightRefresh = fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })
    .then(async (response) => {
      if (!response.ok) {
        removeKeys(ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY);
        return null;
      }
      const body = (await response.json()) as { accessToken?: string; refreshToken?: string };
      if (!body.accessToken) return null;
      writeRaw(ACCESS_TOKEN_KEY, body.accessToken);
      if (body.refreshToken) writeRaw(REFRESH_TOKEN_KEY, body.refreshToken);
      return body.accessToken;
    })
    .catch(() => null)
    .finally(() => {
      inFlightRefresh = null;
    });

  return inFlightRefresh;
}

/** Attaches the bearer token and transparently retries once through /auth/refresh on 401. */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith(API_BASE) || isPublic(request.url)) {
    return next(request);
  }

  const token = readRaw(ACCESS_TOKEN_KEY);
  const authorised = token ? withToken(request, token) : request;

  return next(authorised).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401 || !token) {
        return throwError(() => error);
      }
      return from(refreshAccessToken()).pipe(
        switchMap((fresh) =>
          fresh ? next(withToken(request, fresh)) : throwError(() => error),
        ),
      );
    }),
  );
};
