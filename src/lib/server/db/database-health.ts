import type { Database } from 'bun:sqlite';
import { appliedMigrations } from './pre-migration-backup';

/*
 * The database half of `/healthz` (docs/dev/07 §7.5.1). A read alone passes on a file that lost its
 * write permission, and so does `BEGIN IMMEDIATE`; rewriting `user_version` with its own value
 * inside a rolled-back transaction is the cheapest statement that has to write.
 */

export type DatabaseHealth = { ok: true; migrations: number } | { ok: false };

export function checkDatabase(sqlite: Database): DatabaseHealth {
	try {
		const { user_version } = sqlite.query('PRAGMA user_version').get() as { user_version: number };
		sqlite.exec('BEGIN IMMEDIATE');
		try {
			sqlite.exec(`PRAGMA user_version = ${Number(user_version)}`);
		} finally {
			sqlite.exec('ROLLBACK');
		}
		return { ok: true, migrations: appliedMigrations(sqlite)?.length ?? 0 };
	} catch {
		return { ok: false };
	}
}
