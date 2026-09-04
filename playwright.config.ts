import { defineConfig, devices } from '@playwright/test';

/*
 * End-to-end suite (docs/08 §8.4.1). The browser runs in the pinned Playwright container
 * (`./e2e/run.sh`), the app server runs on the host under Bun — hence `reuseExistingServer`
 * and a loopback base URL both sides can reach via `--network host`.
 */

const PORT = 4173;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
	testDir: 'e2e',
	// One app instance and one database are shared by the suite, so tests run in order.
	fullyParallel: false,
	workers: 1,
	forbidOnly: !!process.env.CI,
	reporter: 'list',
	use: { baseURL: BASE_URL, trace: 'retain-on-failure' },
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	webServer: {
		command: 'bun run e2e:server',
		url: `${BASE_URL}/healthz`,
		timeout: 180_000,
		reuseExistingServer: true
	}
});
