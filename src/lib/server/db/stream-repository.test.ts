import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import { buildStream } from '../domain/stream/stream';
import * as schema from './schema';
import { createDrizzleStreamRepository } from './stream-repository';

/*
 * Integration spec for the Drizzle StreamRepository (docs/02 §2.22.2): each source is
 * newest-first and visibility-scoped — another member's private moment, person or
 * half-private relationship never reaches the viewer's stream, and mention chips only name
 * people the viewer may see.
 */

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const asU2: Viewer = { id: U2, householdId: H };
const asU1: Viewer = { id: U1, householdId: H };

let db: BunSQLiteDatabase<typeof schema>;
let repo: ReturnType<typeof createDrizzleStreamRepository>;

type Vis = 'shared' | 'private';
function seedContact(id: string, at: number, visibility: Vis = 'shared', createdBy = U1) {
	db.insert(schema.contact).values({ id, householdId: H, createdBy, visibility, displayName: id, createdAt: at }).run();
}
let day = 0;
/** Each seeded entry gets its own day: the journal allows one entry per (contact, author, day, visibility). */
function seedEntry(id: string, contactId: string, at: number, visibility: Vis = 'shared', createdBy = U1, mentions: string[] = []) {
	const entryDate = `2026-09-${String(++day).padStart(2, '0')}`;
	db.insert(schema.journalEntry)
		.values({ id, contactId, createdBy, visibility, entryDate, body: `moment ${id}`, createdAt: at })
		.run();
	for (const m of mentions) db.insert(schema.journalMention).values({ journalEntryId: id, contactId: m }).run();
}
function seedInteraction(id: string, contactId: string, at: number, visibility: Vis = 'shared', createdBy = U1, participants: string[] = []) {
	db.insert(schema.interaction)
		.values({ id, contactId, createdBy, visibility, kind: 'call', happenedAt: '2026-09-03', title: `call ${id}`, createdAt: at })
		.run();
	for (const c of participants) db.insert(schema.interactionParticipant).values({ interactionId: id, contactId: c }).run();
}
function seedRelationship(id: string, from: string, to: string, at: number) {
	db.insert(schema.relationship)
		.values({ id, householdId: H, fromContactId: from, toContactId: to, typeId: 'sister', createdBy: U1, createdAt: at })
		.run();
}

beforeEach(() => {
	day = 0;
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
	db.insert(schema.relationshipType)
		.values({ id: 'sister', key: 'sister', forwardLabel: 'sister', reverseLabel: 'sibling', category: 'family' })
		.run();
	repo = createDrizzleStreamRepository(db);
});

describe('recentMoments', () => {
	it('returns visible moments newest-first with author, anchor, visible mentions and photos', async () => {
		seedContact('julia', 1);
		seedContact('marco', 1);
		seedContact('secret', 1, 'private', U1);
		seedEntry('old', 'julia', 100);
		seedEntry('new', 'julia', 300, 'shared', U1, ['marco', 'secret']);
		db.insert(schema.photo)
			.values({ id: 'ph1', householdId: H, contactId: 'julia', journalEntryId: 'new', createdBy: U1, filePath: 'a', thumbPath: 'b', mime: 'image/jpeg' })
			.run();

		const rows = await repo.recentMoments(asU2, 10);
		expect(rows.map((r) => r.id)).toEqual(['new', 'old']);
		expect(rows[0].actor).toEqual({ id: U1, name: 'One' });
		expect(rows[0].anchor.name).toBe('julia');
		expect(rows[0].mentions.map((m) => m.id)).toEqual(['marco']); // 'secret' is not visible to U2
		expect(rows[0].photoIds).toEqual(['ph1']);
	});

	it('hides another member’s private moment and moments on a private person', async () => {
		seedContact('julia', 1);
		seedContact('secret', 1, 'private', U1);
		seedEntry('mine-private', 'julia', 100, 'private', U1);
		seedEntry('on-secret', 'secret', 200);
		seedEntry('shared', 'julia', 300);

		expect((await repo.recentMoments(asU2, 10)).map((r) => r.id)).toEqual(['shared']);
		expect((await repo.recentMoments(asU1, 10)).map((r) => r.id)).toEqual(['shared', 'on-secret', 'mine-private']);
	});
});

describe('recentInteractions', () => {
	it('returns visible interactions newest-first with who logged them and visible participants', async () => {
		seedContact('oma', 1);
		seedContact('opa', 1);
		seedContact('secret', 1, 'private', U1);
		seedInteraction('old', 'oma', 100);
		seedInteraction('new', 'oma', 200, 'shared', U2, ['opa', 'secret']);

		const rows = await repo.recentInteractions(asU2, 10);
		expect(rows.map((r) => r.id)).toEqual(['new', 'old']);
		expect(rows[0]).toMatchObject({
			actor: { id: U2, name: 'Two' },
			subject: { id: 'oma', name: 'oma' },
			interactionKind: 'call',
			happenedAt: '2026-09-03',
			title: 'call new'
		});
		expect(rows[0]!.participants.map((p) => p.id)).toEqual(['opa']);
	});

	it('hides another member’s private interaction and interactions on a private person', async () => {
		seedContact('oma', 1);
		seedContact('secret', 1, 'private', U1);
		seedInteraction('mine-private', 'oma', 100, 'private', U1);
		seedInteraction('on-secret', 'secret', 200);
		seedInteraction('shared', 'oma', 300);

		expect((await repo.recentInteractions(asU2, 10)).map((r) => r.id)).toEqual(['shared']);
		expect((await repo.recentInteractions(asU1, 10)).map((r) => r.id)).toEqual(['shared', 'on-secret', 'mine-private']);
	});
});

describe('recentPeople', () => {
	it('returns visible people newest-first with who added them', async () => {
		seedContact('a', 100);
		seedContact('b', 200, 'private', U1);
		seedContact('c', 300, 'shared', U2);
		const rows = await repo.recentPeople(asU2, 10);
		expect(rows.map((r) => [r.id, r.actor.name])).toEqual([
			['c', 'Two'],
			['a', 'One']
		]);
	});
});

describe('recentRelationships', () => {
	it('returns relationships whose both ends are visible, newest-first', async () => {
		seedContact('julia', 1);
		seedContact('marco', 1);
		seedContact('secret', 1, 'private', U1);
		seedRelationship('r1', 'julia', 'marco', 100);
		seedRelationship('r2', 'secret', 'marco', 200);
		const rows = await repo.recentRelationships(asU2, 10);
		expect(rows.map((r) => r.id)).toEqual(['r1']);
		expect(rows[0]).toMatchObject({ from: { name: 'julia' }, to: { name: 'marco' }, label: 'sister' });
		expect((await repo.recentRelationships(asU1, 10)).map((r) => r.id)).toEqual(['r2', 'r1']);
	});
});

describe('buildStream over the adapter', () => {
	it('merges the sources newest-first', async () => {
		seedContact('julia', 100);
		seedContact('marco', 200);
		seedRelationship('r1', 'julia', 'marco', 300);
		seedEntry('m1', 'julia', 400);
		const items = await buildStream({ stream: repo }, asU2);
		expect(items.map((i) => `${i.kind}:${i.id}`)).toEqual(['moment:m1', 'relationship:r1', 'person:marco', 'person:julia']);
	});
});
