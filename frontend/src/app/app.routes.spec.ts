import { describe, expect, it } from 'vitest';
import type { Route } from '@angular/router';
import { routes } from './app.routes';

/** Flattens the route tree, keeping the full path so failures name the URL. */
function flatten(list: Route[], prefix = ''): { url: string; route: Route }[] {
  return list.flatMap((route) => {
    const url = [prefix, route.path].filter((part) => part !== undefined && part !== '').join('/');
    const self = { url: `/${url}`, route };
    return [self, ...flatten(route.children ?? [], url)];
  });
}

/** A pure `redirectTo` shim is not a navigable state, so it carries no flow. */
const isRedirectShim = (route: Route): boolean =>
  route.redirectTo !== undefined && !route.loadComponent && !route.component;

const all = flatten(routes);
const navigable = all.filter(({ route }) => !isRedirectShim(route));

describe('app.routes', () => {
  it('has navigable routes to check', () => {
    expect(navigable.length).toBeGreaterThan(0);
  });

  it.each(navigable.map(({ url }) => url))('%s carries data.flow', (url) => {
    const entry = navigable.find((candidate) => candidate.url === url)!;
    expect(typeof entry.route.data?.['flow']).toBe('string');
    expect(entry.route.data!['flow']).not.toBe('');
  });

  it('resolves every navigable route to a component', () => {
    for (const { url, route } of navigable) {
      expect(Boolean(route.loadComponent || route.component), `${url} has no component`).toBe(true);
    }
  });

  it('exposes each checkout and wizard step at its own URL', () => {
    const urls = all.map(({ url }) => url);
    for (const expected of [
      '/login',
      '/signup',
      '/quote/new/upload',
      '/quote/new/material',
      '/quote/new/bends',
      '/quote/new/result',
    ]) {
      expect(urls).toContain(expected);
    }
  });

  it('ends with a catch-all so an unknown URL never blanks the shell', () => {
    expect(routes[routes.length - 1].path).toBe('**');
  });
});
