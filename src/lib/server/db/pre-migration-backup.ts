import type { Database } from 'bun:sqlite';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { backupName, backupsToPrune, migrationState, type MigrationState } from './migration-state';

/*
 * The step before `migrate()` (docs/dev/07 §7.10): a database about to be migrated is first copied
 * with `VACUUM INTO`, which is consistent while the file is open, and one a newer image already
 * migrated stops the start instead of running under code that does not know its schema.
 */

const KEEP = 3;

interface Journal {
	entries: { when: number }[];
}

export function guardMigrations(
	sqlite: Database,
	options: { migrationsFolder: string; backupDir: string; version: string }
): MigrationState {
	const journal = JSON.parse(
		readFileSync(join(options.migrationsFolder, 'meta', '_journal.json'), 'utf8')
	) as Journal;
	const state = migrationState({
		journal: journal.entries.map((entry) => entry.when),
		applied: appliedMigrations(sqlite)
	});

	if (state.kind === 'downgrade') {
		throw new Error(
			`The database was migrated by a newer Stella: ${state.unknown} migration(s) are unknown ` +
				`to ${options.version}. Run that version again, or restore a backup taken before it.`
		);
	}
	if (state.kind === 'pending') backUp(sqlite, options.backupDir, backupName(options.version));
	return state;
}

/** `created_at` of every applied migration, or null before the migrations table exists. */
export function appliedMigrations(sqlite: Database): number[] | null {
	const table = sqlite
		.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'")
		.get();
	if (!table) return null;
	return sqlite
		.query<{ created_at: number }, []>('SELECT created_at FROM __drizzle_migrations')
		.all()
		.map((row) => Number(row.created_at));
}

function backUp(sqlite: Database, dir: string, name: string): void {
	mkdirSync(dir, { recursive: true });
	const target = join(dir, name);
	// A retried start keeps the copy from before its first, possibly half-applied, attempt.
	if (!existsSync(target)) sqlite.run('VACUUM INTO ?', [target]);
	const files = readdirSync(dir).map((file) => ({
		name: file,
		mtimeMs: statSync(join(dir, file)).mtimeMs
	}));
	for (const file of backupsToPrune(files, KEEP)) rmSync(join(dir, file));
}
