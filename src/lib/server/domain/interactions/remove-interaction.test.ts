import { beforeEach, describe, expect, it } from 'bun:test';
import { createDrizzleInteractionRepository } from '../../db/interaction-repository';
import * as schema from '../../db/schema';
import { fixedClock, sequentialIds } from '../testing';
import {
	admin,
	ADMIN,
	author,
	AUTHOR,
	foreignAdmin,
	H,
	member,
	MEMBER,
	removalDb,
	type RemovalDb
} from '../testing/removal-db';
import { removeInteraction } from './interactions';

/*
 * Removing a touchpoint (docs/02 §2.6, docs/03 §3.7): its author always, an admin on a shared
 * one. Wired to the real adapter: its participants and the activity entry in the same
 * transaction live there.
 */

const NOW = 1_760_000_000_000;

let t: RemovalDb;
let deps: Parameters<typeof removeInteraction>[0];

function addInteraction(id: string, over: Partial<typeof schema.interaction.$inferInsert> = {}) {
	t.db
		.insert(schema.interaction)
		.values({
			id,
			contactId: 'c-kurt',
			createdBy: AUTHOR,
			visibility: 'shared',
			kind: 'met',
			happenedAt: '2026-10-08',
			title: id,
			...over
		})
		.run();
}

const interactionIds = () =>
	t.db
		.select({ id: schema.interaction.id })
		.from(schema.interaction)
		.all()
		.map((r) => r.id);
const activity = () => t.db.select().from(schema.activityLog).all();

beforeEach(() => {
	t = removalDb();
	deps = {
		interactions: createDrizzleInteractionRepository(t.db),
		ids: sequentialIds('activity'),
		clock: fixedClock(NOW)
	};
});

describe('removeInteraction: who may', () => {
	it('lets the author remove their own touchpoint, shared or private, and logs nothing', async () => {
		addInteraction('i-shared');
		addInteraction('i-private', { visibility: 'private' });

		expect(await removeInteraction(deps, author, 'i-shared')).toBe(true);
		expect(await removeInteraction(deps, author, 'i-private')).toBe(true);

		expect(interactionIds()).toEqual([]);
		expect(activity()).toEqual([]);
	});

	it("lets an admin remove another member's shared touchpoint", async () => {
		addInteraction('i-shared');
		expect(await removeInteraction(deps, admin, 'i-shared')).toBe(true);
		expect(interactionIds()).toEqual([]);
	});

	it("refuses an admin on another member's private touchpoint, and keeps it", async () => {
		addInteraction('i-private', { visibility: 'private' });
		addInteraction('i-control');

		expect(await removeInteraction(deps, admin, 'i-private')).toBe(false);
		expect(await removeInteraction(deps, admin, 'i-control')).toBe(true);
		expect(interactionIds()).toEqual(['i-private']);
	});

	it("refuses a member on someone else's shared touchpoint", async () => {
		addInteraction('i-ninas');
		addInteraction('i-mias', { createdBy: MEMBER });

		expect(await removeInteraction(deps, member, 'i-ninas')).toBe(false);
		expect(await removeInteraction(deps, member, 'i-mias')).toBe(true);
		expect(interactionIds()).toEqual(['i-ninas']);
	});

	it('refuses an admin of another household', async () => {
		addInteraction('i-shared');
		expect(await removeInteraction(deps, foreignAdmin, 'i-shared')).toBe(false);
		expect(await removeInteraction(deps, admin, 'i-shared')).toBe(true);
	});

	it('answers a touchpoint that is gone like one the remover may not touch', async () => {
		expect(await removeInteraction(deps, admin, 'i-never')).toBe(false);
		expect(activity()).toEqual([]);
	});
});

describe('removeInteraction: what goes with it', () => {
	it('takes its participants along', async () => {
		addInteraction('i-with-lea');
		t.db
			.insert(schema.interactionParticipant)
			.values({ interactionId: 'i-with-lea', contactId: 'c-lea' })
			.run();

		await removeInteraction(deps, author, 'i-with-lea');

		expect(t.db.select().from(schema.interactionParticipant).all()).toEqual([]);
	});

	it("logs an admin's removal once, shared, naming kind, person and both members — never the text", async () => {
		addInteraction('i-shared', { title: 'Secret plans', description: 'The surprise party' });

		await removeInteraction(deps, admin, 'i-shared');

		const [entry, ...more] = activity();
		expect(more).toEqual([]);
		expect(entry).toMatchObject({
			householdId: H,
			actorId: ADMIN,
			action: 'delete',
			entityType: 'interaction',
			entityId: 'i-shared',
			contactId: 'c-kurt',
			visibility: 'shared',
			createdAt: NOW
		});
		expect(JSON.parse(entry!.summary)).toEqual({
			person: 'Kurt',
			authorId: AUTHOR,
			authorName: 'Nina'
		});
		expect(entry!.summary).not.toContain('Secret plans');
		expect(entry!.summary).not.toContain('surprise');
	});

	it('keeps the entry as private as the person when the person is private', async () => {
		addInteraction('i-on-secret', { contactId: 'c-secret' });
		await removeInteraction(deps, admin, 'i-on-secret');
		expect(activity().map((a) => a.visibility)).toEqual(['private']);
	});

	it('writes the entry in the same transaction as the delete', async () => {
		addInteraction('i-shared');
		t.sqlite.exec(
			"CREATE TRIGGER no_log BEFORE INSERT ON activity_log BEGIN SELECT RAISE(ABORT, 'no log'); END"
		);

		await expect(removeInteraction(deps, admin, 'i-shared')).rejects.toThrow('no log');
		expect(interactionIds()).toEqual(['i-shared']);
	});
});
