import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import {
	deleteInteraction,
	listInteractions,
	logInteraction,
	type InteractionAuthor
} from '../domain/interactions/interactions';
import { systemClock } from '../clock';
import { createDrizzleInteractionRepository } from './interaction-repository';
import * as schema from './schema';

/*
 * Integration spec for the interaction Drizzle adapter: child-record scoping (§3.7) — a
 * private interaction, or any interaction on a private contact, is only returned to those
 * allowed to see it; participants are stored in their own table and only the ones the viewer
 * may see come back; the timeline is most-recent-day first.
 */

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const author1: InteractionAuthor = { userId: U1, householdId: H, defaultVisibility: 'shared' };
const viewerU1: Viewer = { id: U1, householdId: H };
const viewerU2: Viewer = { id: U2, householdId: H };

let db: BunSQLiteDatabase<typeof schema>;
let ids: { next: () => string };

function deps() {
	return { interactions: createDrizzleInteractionRepository(db), ids, clock: systemClock };
}

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	db.insert(schema.household).values({ id: H, name: 'H' }).run();
	db.insert(schema.user)
		.values([
			{ id: U1, householdId: H, email: 'u1@x.test', name: 'One' },
			{ id: U2, householdId: H, email: 'u2@x.test', name: 'Two' }
		])
		.run();
	db.insert(schema.contact)
		.values([
			{ id: 'oma', householdId: H, createdBy: U1, visibility: 'shared', displayName: 'Oma' },
			{ id: 'opa', householdId: H, createdBy: U1, visibility: 'shared', displayName: 'Opa' },
			{ id: 'secret', householdId: H, createdBy: U1, visibility: 'private', displayName: 'Secret' }
		])
		.run();

	let n = 0;
	ids = { next: () => `i-${++n}` };
});

describe('interaction repository', () => {
	it('lists the timeline most recent day first, with participants by name', async () => {
		await logInteraction(deps(), author1, {
			contactId: 'oma',
			kind: 'call',
			happenedAt: '2026-08-01'
		});
		await logInteraction(deps(), author1, {
			contactId: 'oma',
			kind: 'met',
			happenedAt: '2026-08-30',
			title: 'Sunday lunch',
			participantIds: ['opa']
		});

		const list = await listInteractions(deps(), viewerU1, 'oma');
		expect(list.map((i) => i.happenedAt)).toEqual(['2026-08-30', '2026-08-01']);
		expect(list[0]).toMatchObject({
			kind: 'met',
			title: 'Sunday lunch',
			createdBy: U1,
			visibility: 'shared'
		});
		expect(list[0]!.participants).toEqual([
			{ contactId: 'opa', displayName: 'Opa', avatarPhotoId: null }
		]);
		expect(list[1]!.participants).toEqual([]);
	});

	it('hides a private interaction from other members but shows it to its author', async () => {
		await logInteraction(deps(), author1, {
			contactId: 'oma',
			kind: 'call',
			happenedAt: '2026-08-01',
			title: 'shared call'
		});
		await logInteraction(deps(), author1, {
			contactId: 'oma',
			kind: 'gift',
			happenedAt: '2026-08-02',
			title: 'private gift',
			visibility: 'private'
		});

		const asAuthor = await listInteractions(deps(), viewerU1, 'oma');
		expect(asAuthor.map((i) => i.title)).toEqual(['private gift', 'shared call']);

		const asOther = await listInteractions(deps(), viewerU2, 'oma');
		expect(asOther.map((i) => i.title)).toEqual(['shared call']);
	});

	it('hides the whole timeline when the subject contact is private to someone else', async () => {
		await logInteraction(deps(), author1, { contactId: 'secret', kind: 'met', happenedAt: '2026-08-01' });

		expect(await listInteractions(deps(), viewerU2, 'secret')).toHaveLength(0);
		expect(await listInteractions(deps(), viewerU1, 'secret')).toHaveLength(1);
	});

	it('drops a participant the viewer may not see, but keeps the interaction', async () => {
		await logInteraction(deps(), author1, {
			contactId: 'oma',
			kind: 'met',
			happenedAt: '2026-08-01',
			participantIds: ['secret', 'opa']
		});

		const asOther = await listInteractions(deps(), viewerU2, 'oma');
		expect(asOther).toHaveLength(1);
		expect(asOther[0]!.participants.map((p) => p.contactId)).toEqual(['opa']);

		const asAuthor = await listInteractions(deps(), viewerU1, 'oma');
		expect(asAuthor[0]!.participants.map((p) => p.contactId).sort()).toEqual(['opa', 'secret']);
	});

	it('deleting removes only the author’s own interaction and cascades its participants', async () => {
		const id = await logInteraction(deps(), author1, {
			contactId: 'oma',
			kind: 'met',
			happenedAt: '2026-08-01',
			participantIds: ['opa']
		});
		const author2: InteractionAuthor = { userId: U2, householdId: H, defaultVisibility: 'shared' };

		expect(await deleteInteraction(deps(), author2, id)).toBe(false);
		expect(await listInteractions(deps(), viewerU1, 'oma')).toHaveLength(1);

		expect(await deleteInteraction(deps(), author1, id)).toBe(true);
		expect(await listInteractions(deps(), viewerU1, 'oma')).toHaveLength(0);
		expect(db.select().from(schema.interactionParticipant).all()).toHaveLength(0);
	});
});
