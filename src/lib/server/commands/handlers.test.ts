import { describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { COMMAND_TYPES } from '../../commands/commands';
import type { Clock } from '../clock';
import * as schema from '../db/schema';
import type { IdGenerator } from '../id';
import { createServices } from '../services/app-services';
import type { AuthConfig } from '../services/auth';
import { createCommandHandlers } from './handlers';

/*
 * The command handler table (docs/04 §4.11.2): one handler per command Stella knows, no more.
 * The type system already says so; this keeps the extension point honest on its own.
 */

const clock: Clock = { now: () => Date.UTC(2026, 9, 8, 9) };
const ids: IdGenerator = { next: () => 'id' };

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

describe('createCommandHandlers', () => {
	it('has exactly one handler per command type', () => {
		const sqlite = new Database(':memory:');
		const services = createServices({
			// Nothing here touches a file or the network: the stores are lazy.
			config: {
				...config,
				immich: null,
				sessionSecret: 'a-session-secret',
				updateCheck: false,
				updateFeedUrl: '',
				mediaDir: '/nonexistent/stella-media'
			},
			db: drizzle(sqlite, { schema }),
			sqlite,
			clock,
			ids,
			version: '1.0.0'
		});
		const handlers = createCommandHandlers(services, services.offline);

		expect(Object.keys(handlers).toSorted()).toEqual(COMMAND_TYPES.toSorted());
		for (const type of COMMAND_TYPES) expect(typeof handlers[type]).toBe('function');
	});
});
