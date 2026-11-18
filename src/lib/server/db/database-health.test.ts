import { afterEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { chmodSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkDatabase } from './database-health';

/*
 * What `/healthz` asks the database (docs/dev/07 §7.5.1): can it read, can it take the write lock
 * and write, and how many migrations it has.
 */

const journalLength = (
	JSON.parse(readFileSync('./drizzle/meta/_journal.json', 'utf8')) as { entries: unknown[] }
).entries.length;

let dir: string | null = null;

afterEach(() => {
	if (dir) rmSync(dir, { recursive: true, force: true });
	dir = null;
});

describe('checkDatabase', () => {
	it('is healthy on a migrated database and reports its migrations', () => {
		const sqlite = new Database(':memory:');
		migrate(drizzle(sqlite), { migrationsFolder: './drizzle' });

		expect(checkDatabase(sqlite)).toEqual({ ok: true, migrations: journalLength });
	});

	it('leaves nothing behind', () => {
		const sqlite = new Database(':memory:');
		sqlite.exec('PRAGMA user_version = 7');

		checkDatabase(sqlite);

		expect(sqlite.query('PRAGMA user_version').get()).toEqual({ user_version: 7 });
		expect(sqlite.inTransaction).toBe(false);
	});

	it('reports no migrations before the first one ran', () => {
		expect(checkDatabase(new Database(':memory:'))).toEqual({ ok: true, migrations: 0 });
	});

	// root writes through a read-only mode bit
	it.skipIf(process.getuid?.() === 0)('is unhealthy when the file cannot be written', () => {
		dir = mkdtempSync(join(tmpdir(), 'stella-health-'));
		const path = join(dir, 'stella.db');
		const writer = new Database(path, { create: true });
		writer.exec('PRAGMA journal_mode = WAL; CREATE TABLE t (x)');
		writer.close();
		chmodSync(path, 0o444);
		const sqlite = new Database(path);

		expect(checkDatabase(sqlite)).toEqual({ ok: false });
		expect(sqlite.inTransaction).toBe(false);
		sqlite.close();
	});

	it('is unhealthy when the connection is gone', () => {
		const sqlite = new Database(':memory:');
		sqlite.close();

		expect(checkDatabase(sqlite)).toEqual({ ok: false });
	});
});
