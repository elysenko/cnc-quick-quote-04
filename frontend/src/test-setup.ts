/**
 * Angular ships its libraries partially-compiled, so any module that pulls in an
 * `@angular/*` injectable (the router specs reach `@angular/common`'s
 * `PlatformLocation`) falls back to the JIT compiler at import time. Loading
 * `@angular/compiler` here makes that fallback available to every spec — without
 * it the suite dies during collection, before a single assertion runs.
 */
import '@angular/compiler';
import 'zone.js';
