import { describe, expect, it } from 'bun:test';
import { backupName, backupsToPrune, migrationState } from './migration-state';

/*
 * What startup does before `migrate()` (docs/dev/07 §7.10): back up a database that is about to
 * change, and refuse one that a newer Stella already migrated.
 */

const journal = [1000, 2000, 3000];

describe('migrationState', () => {
	it('calls a database without a migrations table fresh: nothing in it to save', () => {
		expect(migrationState({ journal, applied: null })).toEqual({ kind: 'fresh' });
	});

	it('is current when every migration of the image is applied', () => {
		expect(migrationState({ journal, applied: [1000, 2000, 3000] })).toEqual({ kind: 'current' });
	});

	it('counts the migrations this image would still apply', () => {
		expect(migrationState({ journal, applied: [1000] })).toEqual({ kind: 'pending', count: 2 });
	});

	it('is pending for an empty migrations table', () => {
		expect(migrationState({ journal, applied: [] })).toEqual({ kind: 'pending', count: 3 });
	});

	it('is a downgrade when the database knows a migration the image does not', () => {
		expect(migrationState({ journal, applied: [1000, 2000, 3000, 4000] })).toEqual({
			kind: 'downgrade',
			unknown: 1
		});
	});

	it('is a downgrade even when the image also has migrations still to apply', () => {
		expect(migrationState({ journal, applied: [1000, 4000] })).toEqual({
			kind: 'downgrade',
			unknown: 1
		});
	});
});

describe('backupName', () => {
	it('names the backup after the version about to migrate', () => {
		expect(backupName('0.1.10')).toBe('pre-0.1.10.db');
	});

	it('keeps a version from leaving the backups folder', () => {
		expect(backupName('../x/y')).toBe('pre-.._x_y.db');
	});
});

describe('backupsToPrune', () => {
	it('keeps the newest three pre-migration backups and names the rest', () => {
		const files = [
			{ name: 'pre-0.1.1.db', mtimeMs: 1 },
			{ name: 'pre-0.1.4.db', mtimeMs: 4 },
			{ name: 'pre-0.1.2.db', mtimeMs: 2 },
			{ name: 'pre-0.1.3.db', mtimeMs: 3 },
			{ name: 'pre-0.1.0.db', mtimeMs: 0 }
		];
		expect(backupsToPrune(files, 3).sort()).toEqual(['pre-0.1.0.db', 'pre-0.1.1.db']);
	});

	it('never touches a file it did not write', () => {
		const files = [
			{ name: 'family-2026.tar.gz', mtimeMs: 0 },
			{ name: 'pre-0.1.1.db', mtimeMs: 1 }
		];
		expect(backupsToPrune(files, 0)).toEqual(['pre-0.1.1.db']);
	});
});
