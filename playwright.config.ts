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

/** The one spec that belongs to the `setup` project and to no other. */
const SETUP_SPEC = /auth\.setup\.ts$/;

export default defineConfig({
	testDir: 'e2e',
	// One app instance and one database are shared by the suite, so tests run in order.
	fullyParallel: false,
	workers: 1,
	forbidOnly: !!process.env.CI,
	reporter: 'list',
	use: { baseURL: BASE_URL, trace: 'retain-on-failure' },
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
	webServer: {
		command: 'bun run e2e:server',
		url: `${BASE_URL}/healthz`,
		timeout: 180_000,
		reuseExistingServer: true
	}
});
