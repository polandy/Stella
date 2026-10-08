import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import type { Clock } from '../clock';
import * as schema from '../db/schema';
import type { IdGenerator } from '../id';
import { createServices } from './app-services';
import type { AuthConfig } from './auth';
import { createReleaseServices, type ReleaseWiring } from './release';

/*
 * The release group of the composition root (docs/08 §8.3): what the edge gets from
 * `locals.services.release` must answer end to end — over a feed that needs no network (a
 * `data:` URL stands in for GitHub) — and an instance that makes no check gets no check.
 */

const clock: Clock = { now: () => Date.UTC(2026, 9, 8, 9) };

/** A GitHub `releases/latest` body, served without a network. */
const feedOf = (tag: string) =>
	`data:application/json,${encodeURIComponent(
		JSON.stringify({ tag_name: tag, html_url: `https://example.test/releases/${tag}` })
	)}`;

const wiring: ReleaseWiring = {
	config: { updateCheck: true, updateFeedUrl: feedOf('v1.3.0') },
	clock,
	version: '1.2.0'
};

describe('createReleaseServices', () => {
	it('makes no check when the operator turned it off', () => {
		const release = createReleaseServices({
			...wiring,
			config: { ...wiring.config, updateCheck: false }
		});
		expect(release.updateCheck).toBe(null);
	});

	it('makes no check when this build carries no readable release number', () => {
		expect(createReleaseServices({ ...wiring, version: 'dev' }).updateCheck).toBe(null);
	});

	it('reads the configured feed and says a newer release is out', async () => {
		const { updateCheck } = createReleaseServices(wiring);
		if (!updateCheck) throw new Error('the check should be made');

		const status = await updateCheck.status();
		expect(status.state).toBe('available');
		expect(status.current).toBe('1.2.0');
		expect(status.latest).toBe('v1.3.0');
		expect(status.checkedAt).toBe(clock.now());
	});
});

describe('createServices', () => {
	it('groups the release context under `release`, one check for the process', () => {
		const config: AuthConfig = {
			url: 'https://stella.example.test',
			auth: { local: true, oidc: false },
			oidc: {
				issuer: '',
				clientId: '',
				clientSecret: '',
				redirectUri: '',
				scopes: 'openid',
				providerName: 'authelia',
				allowedGroups: [],
				adminGroups: [],
				allowedEmails: [],
				jitProvision: false,
				linkByEmail: false,
				syncRoles: false,
				syncProfile: false,
				rpLogout: false
			}
		};
		const sqlite = new Database(':memory:');
		const ids: IdGenerator = { next: () => 'id' };
		const services = createServices({
			// Nothing here touches a file or the network: the stores and the check are lazy.
			config: {
				...config,
				immich: null,
				sessionSecret: 'a-session-secret',
				mediaDir: '/nonexistent/stella-media',
				...wiring.config
			},
			db: drizzle(sqlite, { schema }),
			sqlite,
			clock,
			ids,
			version: wiring.version
		});
		expect(services.release.updateCheck).not.toBe(null);
	});
});
