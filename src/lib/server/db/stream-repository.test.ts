import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import { buildStream, type StreamQuery } from '../domain/stream/stream';
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
/** A read narrowed to nobody in particular. */
const EVERYONE: StreamQuery = { limit: 10, memberId: null };

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
function seedRelationship(id: string, from: string, to: string, at: number, createdBy = U1) {
	db.insert(schema.relationship)
		.values({ id, householdId: H, fromContactId: from, toContactId: to, typeId: 'sister', createdBy, createdAt: at })
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

		const rows = await repo.recentMoments(asU2, EVERYONE);
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

		expect((await repo.recentMoments(asU2, EVERYONE)).map((r) => r.id)).toEqual(['shared']);
		expect((await repo.recentMoments(asU1, EVERYONE)).map((r) => r.id)).toEqual(['shared', 'on-secret', 'mine-private']);
	});
});

describe('recentInteractions', () => {
	it('returns visible interactions newest-first with who logged them and visible participants', async () => {
		seedContact('oma', 1);
		seedContact('opa', 1);
		seedContact('secret', 1, 'private', U1);
		seedInteraction('old', 'oma', 100);
		seedInteraction('new', 'oma', 200, 'shared', U2, ['opa', 'secret']);

		const rows = await repo.recentInteractions(asU2, EVERYONE);
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

		expect((await repo.recentInteractions(asU2, EVERYONE)).map((r) => r.id)).toEqual(['shared']);
		expect((await repo.recentInteractions(asU1, EVERYONE)).map((r) => r.id)).toEqual(['shared', 'on-secret', 'mine-private']);
	});
});

describe('recentPeople', () => {
	it('returns visible people newest-first with who added them', async () => {
		seedContact('a', 100);
		seedContact('b', 200, 'private', U1);
		seedContact('c', 300, 'shared', U2);
		const rows = await repo.recentPeople(asU2, EVERYONE);
		expect(rows.map((r) => [r.id, r.actor.name])).toEqual([
			['c', 'Two'],
			['a', 'One']
		]);
	});

	it('drops someone the household has archived', async () => {
		seedContact('a', 100);
		seedContact('c', 300);
		db.update(schema.contact)
			.set({ archivedAt: 1_700_000_000_000 })
			.where(eq(schema.contact.id, 'c'))
			.run();

		const rows = await repo.recentPeople(asU2, EVERYONE);
		// positive control: the one still in the household is there, so this is no empty pass.
		expect(rows.map((r) => r.id)).toEqual(['a']);
	});
});

describe('recentNotices', () => {
	/** A logged deletion, the only stream source whose subject no longer exists. */
	function logRemoval(
		id: string,
		at: number,
		actorId: string,
		visibility: 'shared' | 'private',
		action: 'delete' | 'merge' = 'delete'
	) {
		db.insert(schema.activityLog)
			.values({
				id,
				householdId: H,
				actorId,
				action,
				entityType: 'contact',
				entityId: `c-${id}`,
				contactId: null,
				visibility,
				summary: `removed Person ${id}`,
				createdAt: at
			})
			.run();
	}

	it('reports a shared removal to the whole household, newest first', async () => {
		logRemoval('older', 100, U1, 'shared');
		logRemoval('newer', 200, U1, 'shared');

		const rows = await repo.recentNotices(asU2, EVERYONE);
		expect(rows.map((r) => r.id)).toEqual(['newer', 'older']);
		expect(rows[0]).toMatchObject({ actor: { id: U1, name: 'One' }, summary: 'removed Person newer' });
	});

	it('reports a merge too — a name stops existing either way', async () => {
		logRemoval('merged', 100, U1, 'shared', 'merge');

		expect((await repo.recentNotices(asU2, EVERYONE)).map((r) => r.id)).toEqual(['merged']);
	});

	it('reports an export, so the household sees that its archive was taken', async () => {
		// The archive carries every member's private records (docs/02 §2.15). Admin-only is
		// half of what makes that acceptable; the household being able to see it is the other.
		db.insert(schema.activityLog)
			.values({
				id: 'exported',
				householdId: H,
				actorId: U1,
				action: 'export',
				entityType: 'household',
				entityId: H,
				contactId: null,
				visibility: 'shared',
				summary: 'exported the household archive (12 people)',
				createdAt: 300
			})
			.run();

		const rows = await repo.recentNotices(asU2, EVERYONE);
		expect(rows.map((r) => r.summary)).toEqual(['exported the household archive (12 people)']);
	});

	it('reports an import, because a restore moves the household\u2019s data too', async () => {
		db.insert(schema.activityLog)
			.values({
				id: 'imported',
				householdId: H,
				actorId: U1,
				action: 'import',
				entityType: 'household',
				entityId: H,
				contactId: null,
				visibility: 'shared',
				summary: 'restored 12 people from an archive of Familie Brunner',
				createdAt: 400
			})
			.run();

		const rows = await repo.recentNotices(asU2, EVERYONE);
		expect(rows.map((r) => r.summary)).toEqual([
			'restored 12 people from an archive of Familie Brunner'
		]);
	});

	it('leaves the everyday edits out, so the stream stays what happened in the family', async () => {
		// Only what no table can report belongs here; an archive or an update is not that.
		logRemoval('edited', 100, U1, 'shared', 'update' as 'delete');

		expect(await repo.recentNotices(asU2, EVERYONE)).toHaveLength(0);
		// positive control: the same insert with a logged action does come back.
		logRemoval('gone', 110, U1, 'shared');
		expect((await repo.recentNotices(asU2, EVERYONE)).map((r) => r.id)).toEqual(['gone']);
	});

	it('keeps a private person private, even in the record of their deletion', async () => {
		logRemoval('secret', 100, U1, 'private');
		logRemoval('open', 100, U1, 'shared');

		expect((await repo.recentNotices(asU2, EVERYONE)).map((r) => r.id)).toEqual(['open']);
		// positive control: the member who deleted them sees both.
		expect((await repo.recentNotices(asU1, EVERYONE)).map((r) => r.id).sort()).toEqual(['open', 'secret']);
	});

	it('narrowed to one member, reports only what that member did', async () => {
		logRemoval('by-one', 100, U1, 'shared');
		logRemoval('by-two', 200, U2, 'shared');

		expect((await repo.recentNotices(asU2, { limit: 10, memberId: U1 })).map((r) => r.id)).toEqual(['by-one']);
		expect((await repo.recentNotices(asU2, { limit: 10, memberId: U2 })).map((r) => r.id)).toEqual(['by-two']);
	});
});

describe('narrowed to one member (docs/02 §2.22.2)', () => {
	const byOne: StreamQuery = { limit: 10, memberId: U1 };

	it('returns only what that member did, from every table-backed source', async () => {
		seedContact('julia', 100, 'shared', U1);
		seedContact('marco', 110, 'shared', U2);
		seedEntry('m-one', 'julia', 200, 'shared', U1);
		seedEntry('m-two', 'julia', 210, 'shared', U2);
		seedInteraction('i-one', 'julia', 300, 'shared', U1);
		seedInteraction('i-two', 'julia', 310, 'shared', U2);
		seedRelationship('r-one', 'julia', 'marco', 400, U1);
		seedRelationship('r-two', 'marco', 'julia', 410, U2);

		expect((await repo.recentMoments(asU2, byOne)).map((r) => r.id)).toEqual(['m-one']);
		expect((await repo.recentPeople(asU2, byOne)).map((r) => r.id)).toEqual(['julia']);
		expect((await repo.recentInteractions(asU2, byOne)).map((r) => r.id)).toEqual(['i-one']);
		expect((await repo.recentRelationships(asU2, byOne)).map((r) => r.id)).toEqual(['r-one']);
	});

	it('never widens what the viewer may see: another member\u2019s private moment stays theirs', async () => {
		seedContact('julia', 100, 'shared', U1);
		seedEntry('open', 'julia', 200, 'shared', U1);
		seedEntry('secret', 'julia', 210, 'private', U1);
		seedInteraction('secret-call', 'julia', 300, 'private', U1);

		expect((await repo.recentMoments(asU2, byOne)).map((r) => r.id)).toEqual(['open']);
		expect(await repo.recentInteractions(asU2, byOne)).toHaveLength(0);
		// positive control: the author, narrowed to themself, sees both.
		expect((await repo.recentMoments(asU1, byOne)).map((r) => r.id)).toEqual(['secret', 'open']);
		expect((await repo.recentInteractions(asU1, byOne)).map((r) => r.id)).toEqual(['secret-call']);
	});

	it('fills the limit with that member\u2019s items, not what is left after everyone else\u2019s', async () => {
		seedContact('julia', 1, 'shared', U1);
		seedEntry('one-old', 'julia', 100, 'shared', U1);
		for (let i = 0; i < 3; i++) seedEntry(`two-${i}`, 'julia', 200 + i, 'shared', U2);

		const rows = await repo.recentMoments(asU2, { limit: 2, memberId: U1 });
		expect(rows.map((r) => r.id)).toEqual(['one-old']);
	});
});

describe('recentRelationships', () => {
	it('returns relationships whose both ends are visible, newest-first', async () => {
		seedContact('julia', 1);
		seedContact('marco', 1);
		seedContact('secret', 1, 'private', U1);
		seedRelationship('r1', 'julia', 'marco', 100);
		seedRelationship('r2', 'secret', 'marco', 200);
		const rows = await repo.recentRelationships(asU2, EVERYONE);
		expect(rows.map((r) => r.id)).toEqual(['r1']);
		expect(rows[0]).toMatchObject({ from: { name: 'julia' }, to: { name: 'marco' }, label: 'sister' });
		expect((await repo.recentRelationships(asU1, EVERYONE)).map((r) => r.id)).toEqual(['r2', 'r1']);
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
