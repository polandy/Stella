/*
 * Where the `setup` project leaves the signed-in session that every other spec starts from
 * (see `playwright.config.ts`). It sits beside the test database because it belongs to the
 * same throwaway run — `bun run e2e:server` wipes both when it builds a fresh server.
 */
export const AUTH_STATE_PATH = 'data/e2e/auth-state.json';
