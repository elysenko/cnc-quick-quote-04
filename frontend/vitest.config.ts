import { defineConfig } from 'vitest/config';

/**
 * Node-side unit tests for framework-free logic: route metadata, canvas
 * coordinate mapping, formatting. Component/DOM tests run under the Angular
 * `ng test` (karma) target, which needs a browser.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    globals: true,
  },
});
