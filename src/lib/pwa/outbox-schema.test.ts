import { describe, expect, it } from 'bun:test';
import { COMMAND_SCHEMA_VERSION } from '../commands/commands';
import { OUTBOX_FIXTURES } from './fixtures/outbox-fixtures';
import { MIGRATIONS, migrateOutbox } from './outbox-schema';
import { takeBatch, type OutboxItem } from './outbox';

/*
 * An outbox kept by an older build (docs/dev/04 §4.11.2): the queue is the only copy of what a
 * member wrote, so a release reads whatever the release before it left on the device.
 */

describe('migrateOutbox', () => {
	it('has one migration for every version before the current one', () => {
		const versions = Array.from({ length: COMMAND_SCHEMA_VERSION }, (_, v) => v);
		expect(Object.keys(MIGRATIONS).map(Number)).toEqual(versions);
	});

	it('has a checked-in queue of every version before the current one', () => {
		expect(OUTBOX_FIXTURES.map((fixture) => fixture.version)).toEqual(
			Array.from({ length: COMMAND_SCHEMA_VERSION }, (_, v) => v)
		);
	});

	for (const fixture of OUTBOX_FIXTURES) {
		it(`reads the queue release N-1 left (version ${fixture.version}) as version N`, () => {
			const read = migrateOutbox(fixture.items);

			expect(read).toHaveLength(fixture.items.length);
			for (const [i, item] of read.entries()) {
				const kept = fixture.items[i] as OutboxItem;
				expect(item.schemaVersion).toBe(COMMAND_SCHEMA_VERSION);
				// Whose it is and where it stands survive every migration; the payload's reading is
				// held by the server's own fixture test (`server/commands/parse.test.ts`).
				expect(item).toMatchObject({
					command: { id: kept.command.id, type: kept.command.type },
					memberId: kept.memberId,
					state: kept.state,
					reason: kept.reason,
					savedAt: kept.savedAt,
					about: kept.about
				});
			}
		});
	}

	it('leaves its input alone', () => {
		const [{ items }] = OUTBOX_FIXTURES;
		const before = structuredClone(items);
		migrateOutbox(items);
		expect(items).toEqual(before);
	});

	it('keeps an item a newer build wrote as it is, and never sends it', () => {
		const [current] = migrateOutbox(OUTBOX_FIXTURES[0].items);
		const newer: OutboxItem = {
			...current,
			schemaVersion: COMMAND_SCHEMA_VERSION + 1,
			command: { ...current.command, id: '01K9V0A1B2C3D4E5F6G7H8J9KZ' }
		};

		const read = migrateOutbox([newer, current]);
		expect(read[0]).toEqual(newer);
		expect(takeBatch(read, current.memberId, 10).batch.map((c) => c.id)).toEqual([
			current.command.id
		]);
	});
});
