import { defineConfig, devices } from '@playwright/test';
import { AUTH_STATE_PATH } from './e2e/auth-state';

/*
 * End-to-end suite (docs/08 §8.4.1). The browser runs in the pinned Playwright container
 * (`./e2e/run.sh`), the app server runs on the host under Bun — hence `reuseExistingServer`
 * and a loopback base URL both sides can reach via `--network host`.
 */

// Overridable so two worktrees can run the suite at once without silently sharing a server.
const PORT = Number(process.env.E2E_PORT ?? 4173);
const BASE_URL = `http://127.0.0.1:${PORT}`;

// The app asks this instead of GitHub for the release check, so the About card has a fixed
// answer to render (`e2e/release-feed-stub.ts`).
const FEED_PORT = Number(process.env.E2E_FEED_PORT ?? 4174);

/** The one spec that belongs to the `setup` project and to no other. */
const SETUP_SPEC = /auth\.setup\.ts$/;

/*
 * No service worker, for a suite that never tests one.
 *
 * Shard 1 has been dying with a Chromium `SIGSEGV` in the **browser** process — always the
 * same faulting address, always in its glib main loop — which takes whichever test is running
 * with it, so the victim moves between runs and no assertion ever fails: the error is always
 * the next `newContext` finding the browser gone. It reproduces on a re-run of an untouched
 * green commit, so it is the environment rather than any one change.
 *
 * The browser process is also where Chromium keeps the service worker registry, and since the
 * PWA landed every page registers one (`OfflineBanner` waits on `serviceWorker.ready`) while
 * the suite creates and destroys a context per test. Blocking registration takes that out of
 * the crashing process and costs no coverage: there is no PWA spec, and the install and
 * offline rules are unit-tested as pure policy in `src/lib/pwa/`.
 *
 * This is the suspect, not a proven cause. `--disable-gpu` was the previous one and was wrong:
 * the crash survived it unchanged, down to the address.
 */
const NO_SERVICE_WORKER = 'block' as const;

export default defineConfig({
	testDir: 'e2e',
	// One app instance and one database are shared by the suite, so tests run in order.
	fullyParallel: false,
	workers: 1,
	forbidOnly: !!process.env.CI,
	reporter: 'list',
	use: { baseURL: BASE_URL, trace: 'retain-on-failure', serviceWorkers: NO_SERVICE_WORKER },
	projects: [
		// Signs in once; every spec below starts from the session it stores, which is a page
		// load and a form post saved per test.
		{ name: 'setup', testMatch: SETUP_SPEC, use: { ...devices['Desktop Chrome'] } },
		{
			name: 'chromium',
			testIgnore: SETUP_SPEC,
			dependencies: ['setup'],
			use: { ...devices['Desktop Chrome'], storageState: AUTH_STATE_PATH }
		}
	],
	webServer: [
		{
			command: 'bun run e2e:server',
			url: `${BASE_URL}/healthz`,
			timeout: 180_000,
			reuseExistingServer: true
		},
		{
			command: 'bun e2e/release-feed-stub.ts',
			url: `http://127.0.0.1:${FEED_PORT}/latest`,
			env: { PORT: String(FEED_PORT) },
			timeout: 30_000,
			reuseExistingServer: true
		}
	]
});
