import v0 from './outbox-v0.json';

/*
 * Each queue as a released build left it on a device, one per `COMMAND_SCHEMA_VERSION` before
 * the current one (docs/dev/08 §8.12). JSON stands in for IndexedDB's structured clone, so the
 * photos, whose bytes are Blobs, are left out.
 */
export const OUTBOX_FIXTURES: readonly { version: number; items: readonly unknown[] }[] = [
	{ version: 0, items: v0 }
];
