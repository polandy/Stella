import { LOCALES } from './locales';
import { loadCatalog } from './translate';

/*
 * Preloaded by `bun test` (bunfig.toml). The app only ever translates after its root load
 * has fetched the reader's catalogue (docs/04 §4.4); the unit tests construct translators
 * at module scope, so every language is put on the shelf before the first test file loads —
 * the same thing `init` in `hooks.server.ts` does for the server.
 */
await Promise.all(LOCALES.map((locale) => loadCatalog(locale)));
