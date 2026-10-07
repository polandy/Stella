import { describe, expect, it } from 'bun:test';
import { getConfig } from './config';

/*
 * `$env/dynamic/private` only resolves inside a running SvelteKit server;
 * `env-test-preload.ts` (bunfig.toml) stubs it to an empty env before any test file loads, so
 * `getConfig()` falls back to the schema's defaults here regardless of which other test ran
 * first (docs/08 §8.4 — no test may depend on run order). Guards against the stub moving back
 * into a per-file `mock.module`, which `bun:test` never reverts between files.
 */
describe('getConfig', () => {
	it('builds from the stubbed empty env, local sign-in on and SSO off by default', () => {
		const config = getConfig();
		expect(config.auth).toEqual({ local: true, oidc: false });
	});
});
