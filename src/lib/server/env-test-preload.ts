import { mock } from 'bun:test';

/*
 * Preloaded by `bun test` (bunfig.toml), once, before any test file runs. `$env/dynamic/private`
 * only resolves inside a running SvelteKit server, so a route test that imports anything on the
 * `config.ts` chain (via `auth/cookies`, …) needs it stubbed to get the config's defaults.
 *
 * This used to be mocked inside the one test file that needed it (`logout.test.ts`). `bun:test`'s
 * `mock.module` replaces the module in the process-wide registry and is never reverted between
 * test files (confirmed empirically — a later file's `import` sees the earlier file's mock), so a
 * per-file mock would make any other test's result depend on run order. Stubbing it once here,
 * before any file loads, keeps every file's result independent of when it runs.
 */
mock.module('$env/dynamic/private', () => ({ env: {} }));
