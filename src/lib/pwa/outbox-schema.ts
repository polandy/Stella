import { COMMAND_SCHEMA_VERSION } from '../commands/commands';
import type { OutboxItem } from './outbox';

/*
 * An outbox kept by an older build, brought up to this one as it is read (docs/dev/04 §4.11.2,
 * docs/dev/08 §8.12). Pure; `outbox-store.ts` runs it on every read. A version is raised only
 * with a migration from the one before it here and a fixture of the queue it replaces.
 */

type StoredItem = Record<string, unknown>;

/** From each version to the next; the key is the version migrated from. */
export const MIGRATIONS: Readonly<Record<number, (item: StoredItem) => StoredItem>> = {
	// Before versions: the same shape, unstamped.
	0: (item) => ({ ...item, schemaVersion: 1 })
};

function versionOf(item: StoredItem): number {
	return typeof item.schemaVersion === 'number' ? item.schemaVersion : 0;
}

function migrateItem(stored: StoredItem): StoredItem {
	let item = stored;
	// A newer build's item stays as it is: `takeBatch` holds it back, and nothing is lost.
	while (versionOf(item) < COMMAND_SCHEMA_VERSION) {
		const migrate = MIGRATIONS[versionOf(item)];
		if (!migrate) throw new Error(`No outbox migration from version ${versionOf(item)}`);
		item = migrate(item);
	}
	return item;
}

/** `stored`, as a device kept it, in this build's shape; the input is left alone. */
export function migrateOutbox(stored: readonly unknown[]): OutboxItem[] {
	return stored.map((item) => migrateItem(item as StoredItem) as unknown as OutboxItem);
}
