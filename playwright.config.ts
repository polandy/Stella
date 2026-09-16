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
 * No GPU process, for a suite that has no use for one.
 *
 * On a CI runner Chromium's GPU process never comes up — `drmGetDevices2() has not found any
 * devices`, then a sandbox warning about initialising with several threads — and the browser
 * process that hosts it has been dying with a null dereference (`SIGSEGV`, always at `0x1b0`)
 * somewhere in its glib main loop. It takes whichever test is running down with it, so the
 * victim moves between runs and no assertion ever fails: the error is always the next
 * `newContext` finding the browser gone.
 *
 * Nothing here draws through the GPU — the graph is Cytoscape on a 2D canvas — so the process
 * is pure liability. `--disable-gpu` removes it, and with it the host object that was being
 * dereferenced.
 */
const NO_GPU = ['--disable-gpu'];

export default defineConfig({
	testDir: 'e2e',
	// One app instance and one database are shared by the suite, so tests run in order.
	fullyParallel: false,
	workers: 1,
	forbidOnly: !!process.env.CI,
	reporter: 'list',
	use: { baseURL: BASE_URL, trace: 'retain-on-failure', launchOptions: { args: NO_GPU } },
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
