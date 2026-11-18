import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	utimesSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { guardMigrations } from './pre-migration-backup';

/*
 * Before `migrate()` a database that is about to change is copied to `backups/pre-<version>.db`,
 * the newest three such copies are kept, and a database a newer image migrated stops the start
 * (docs/dev/07 §7.10).
 */

const MIGRATIONS = './drizzle';

interface Journal {
	entries: { tag: string; when: number }[];
}

let dir: string;
let sqlite: Database;

function migrationsWithout(last: number): string {
	const folder = join(dir, `migrations-${last}`);
	cpSync(MIGRATIONS, folder, { recursive: true });
	const journalPath = join(folder, 'meta', '_journal.json');
	const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as Journal;
	journal.entries = journal.entries.slice(0, journal.entries.length - last);
	writeFileSync(journalPath, JSON.stringify(journal));
	return folder;
}

function guard(migrationsFolder = MIGRATIONS, version = '9.9.9') {
	return guardMigrations(sqlite, { migrationsFolder, backupDir: join(dir, 'backups'), version });
}

function backups(): string[] {
	return existsSync(join(dir, 'backups')) ? readdirSync(join(dir, 'backups')).sort() : [];
}

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'stella-guard-'));
	sqlite = new Database(join(dir, 'stella.db'), { create: true });
});

afterEach(() => {
	sqlite.close();
	rmSync(dir, { recursive: true, force: true });
});

describe('guardMigrations', () => {
	it('takes no backup of a fresh database', () => {
		expect(guard()).toEqual({ kind: 'fresh' });
		expect(backups()).toEqual([]);
	});

	it('takes no backup when nothing is pending', () => {
		migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS });
		expect(guard()).toEqual({ kind: 'current' });
		expect(backups()).toEqual([]);
	});

	it('copies the database as it was before pending migrations run', () => {
		migrate(drizzle(sqlite), { migrationsFolder: migrationsWithout(1) });
		const before = sqlite.query('SELECT count(*) AS n FROM __drizzle_migrations').get() as {
			n: number;
		};

		expect(guard()).toEqual({ kind: 'pending', count: 1 });

		expect(backups()).toEqual(['pre-9.9.9.db']);
		const copy = new Database(join(dir, 'backups', 'pre-9.9.9.db'), { readonly: true });
		expect(copy.query('SELECT count(*) AS n FROM __drizzle_migrations').get()).toEqual(before);
		copy.close();
	});

	it('keeps the first backup of a version when a failed start is retried', () => {
		migrate(drizzle(sqlite), { migrationsFolder: migrationsWithout(2) });
		guard();
		const first = readFileSync(join(dir, 'backups', 'pre-9.9.9.db'));
		migrate(drizzle(sqlite), { migrationsFolder: migrationsWithout(1) });

		guard();

		expect(readFileSync(join(dir, 'backups', 'pre-9.9.9.db'))).toEqual(first);
	});

	it('keeps only the newest three of its own backups', () => {
		mkdirSync(join(dir, 'backups'));
		for (const [i, name] of ['pre-0.1.0.db', 'pre-0.1.1.db', 'pre-0.1.2.db'].entries()) {
			writeFileSync(join(dir, 'backups', name), '');
			utimesSync(join(dir, 'backups', name), i + 1, i + 1);
		}
		writeFileSync(join(dir, 'backups', 'family.tar.gz'), '');
		migrate(drizzle(sqlite), { migrationsFolder: migrationsWithout(1) });

		guard();

		expect(backups()).toEqual(['family.tar.gz', 'pre-0.1.1.db', 'pre-0.1.2.db', 'pre-9.9.9.db']);
	});

	it('stops the start on a database a newer image migrated', () => {
		migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS });

		expect(() => guard(migrationsWithout(2))).toThrow(/newer Stella/);
		expect(backups()).toEqual([]);
	});
});
