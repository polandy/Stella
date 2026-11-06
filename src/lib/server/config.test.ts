import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { configKeys, getConfig } from './config';

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

/*
 * `.env.example` and docs/04 §4.5 are the installer's checklist; a key added to the schema
 * without them is a switch nobody finds (review TD-06).
 */
describe('configKeys', () => {
	const repoRoot = join(import.meta.dir, '../../..');

	it.each([['.env.example'], ['docs/architecture/4.5-configuration.md']])(
		'every key appears in %s',
		async (file) => {
			const text = await Bun.file(join(repoRoot, file)).text();
			const missing = configKeys.filter((key) => !new RegExp(`^#? ?${key}=`, 'm').test(text));
			expect(missing).toEqual([]);
		}
	);
});
