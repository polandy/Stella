/*
 * Where a database stands against the migrations an image ships (docs/dev/07 §7.10). Pure: the
 * startup guard (`pre-migration-backup.ts`) reads both sides and acts on the answer.
 *
 * Drizzle stores each applied migration's journal timestamp (`when`) as `created_at`, and applies
 * every journal entry newer than the newest row; so a row the journal does not know can only
 * have come from a newer image.
 */

export type MigrationState =
	| { kind: 'fresh' }
	| { kind: 'current' }
	| { kind: 'pending'; count: number }
	| { kind: 'downgrade'; unknown: number };

export function migrationState(input: {
	/** The `when` of every journal entry this image ships. */
	journal: readonly number[];
	/** `created_at` of every applied migration; null when the table does not exist yet. */
	applied: readonly number[] | null;
}): MigrationState {
	const { journal, applied } = input;
	if (applied === null) return { kind: 'fresh' };
	const known = new Set(journal);
	const unknown = applied.filter((when) => !known.has(when)).length;
	if (unknown > 0) return { kind: 'downgrade', unknown };
	const newest = applied.length === 0 ? -Infinity : Math.max(...applied);
	const count = journal.filter((when) => when > newest).length;
	return count === 0 ? { kind: 'current' } : { kind: 'pending', count };
}

const PREFIX = 'pre-';
const SUFFIX = '.db';

/** The file a backup taken before migrating to `version` is written to. */
export function backupName(version: string): string {
	return `${PREFIX}${version.replace(/[^\w.-]/g, '_')}${SUFFIX}`;
}

/** Which of the guard's own backups to delete so that the newest `keep` remain. */
export function backupsToPrune(
	files: readonly { name: string; mtimeMs: number }[],
	keep: number
): string[] {
	return files
		.filter((file) => file.name.startsWith(PREFIX) && file.name.endsWith(SUFFIX))
		.sort((a, b) => b.mtimeMs - a.mtimeMs)
		.slice(keep)
		.map((file) => file.name);
}
