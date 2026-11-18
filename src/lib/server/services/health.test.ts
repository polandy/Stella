import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { createHealthServices } from './health';

/*
 * The health group of the composition root (docs/dev/08 §8.3): `locals.services.health` answers
 * for the database the process holds, with the running version either way.
 */

describe('createHealthServices', () => {
	it('reports a working database with its version and migrations', () => {
		const sqlite = new Database(':memory:');
		migrate(drizzle(sqlite), { migrationsFolder: './drizzle' });

		const report = createHealthServices({ sqlite, version: '0.1.10' }).check();

		expect(report).toMatchObject({ ok: true, version: '0.1.10' });
		expect(report.ok && report.migrations).toBeGreaterThan(0);
	});

	it('reports a database it cannot use, still naming the version', () => {
		const sqlite = new Database(':memory:');
		sqlite.close();

		expect(createHealthServices({ sqlite, version: '0.1.10' }).check()).toEqual({
			ok: false,
			version: '0.1.10'
		});
	});
});
