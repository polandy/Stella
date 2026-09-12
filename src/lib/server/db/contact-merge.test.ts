import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { eq } from 'drizzle-orm';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import type { NewActivityEntry } from '../domain/activity/activity';
import type { MergeableProfile } from '../domain/contacts/merge-profile';
import { mergeContacts } from './contact-merge';
import * as schema from './schema';
import { seedRelationshipTypes } from './seed';

/*
 * Merging duplicates (docs/02 §2.2). Everything hanging off the record merged away has to
 * arrive at the survivor, and every constraint that says "the survivor already has that" has
 * to be settled without losing what somebody wrote.
 */

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const viewer: Viewer = { id: U1, householdId: H };
const viewerU2: Viewer = { id: U2, householdId: H };

let db: BunSQLiteDatabase<typeof schema>;

const PROFILE: MergeableProfile = {
	firstName: 'Hans',
	lastName: 'Müller',
	nickname: null,
	prefix: null,
	suffix: null,
	formerName: null,
	gender: null,
	pronouns: null,
	description: 'the merged one',
	avatarPhotoId: null,
	birthDate: null,
	birthDatePrecision: 'full',
	isDeceased: false,
	deathDate: null,
	jobTitle: null,
	company: null,
	howWeMet: null,
	metDate: null,
	metPlace: null
};

const audit: NewActivityEntry = {
	id: 'log-1',
	householdId: H,
	actorId: U1,
	action: 'merge',
	entityType: 'contact',
	entityId: 'dup',
	contactId: 'keep',
	visibility: 'shared',
	summary: 'merged Duplicate Hans into Hans Müller',
	createdAt: 1_700_000_000_000
};

function seedContact(id: string, displayName: string, visibility: 'shared' | 'private' = 'shared', createdBy = U1) {
	db.insert(schema.contact).values({ id, householdId: H, createdBy, visibility, displayName }).run();
}

const merge = (v: Viewer = viewer, keepId = 'keep', mergedId = 'dup') =>
	mergeContacts(db, v, { keepId, mergedId, profile: PROFILE, audit, updatedAt: 999 });

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	seedRelationshipTypes(db);
	db.insert(schema.household).values({ id: H, name: 'H' }).run();
	db.insert(schema.user)
		.values([
			{ id: U1, householdId: H, email: 'u1@x.test', name: 'One' },
			{ id: U2, householdId: H, email: 'u2@x.test', name: 'Two' }
		])
		.run();
	seedContact('keep', 'Hans Müller');
	seedContact('dup', 'Duplicate Hans');
});

describe('what follows the person', () => {
	it('brings their fields, notes, dates, photos and interactions across', () => {
		db.insert(schema.contactField).values({ id: 'f1', contactId: 'dup', kind: 'phone', value: '079' }).run();
		db.insert(schema.note).values({ id: 'n1', contactId: 'dup', createdBy: U1, body: 'a note' }).run();
		db.insert(schema.importantDate).values({ id: 'd1', contactId: 'dup', kind: 'anniversary', date: '2009-06-13' }).run();
		db.insert(schema.photo).values({ id: 'p1', householdId: H, contactId: 'dup', createdBy: U1, filePath: 'a.jpg', thumbPath: 'a-t.jpg', mime: 'image/jpeg' }).run();
		db.insert(schema.interaction).values({ id: 'i1', contactId: 'dup', createdBy: U1, kind: 'call', happenedAt: '2026-01-01' }).run();

		expect(merge()).toBe(true);

		expect(db.select().from(schema.contactField).all()[0].contactId).toBe('keep');
		expect(db.select().from(schema.note).all()[0].contactId).toBe('keep');
		expect(db.select().from(schema.importantDate).all()[0].contactId).toBe('keep');
		expect(db.select().from(schema.photo).all()[0].contactId).toBe('keep');
		expect(db.select().from(schema.interaction).all()[0].contactId).toBe('keep');
		// The duplicate is gone and the survivor wears the merged profile.
		expect(db.select().from(schema.contact).all().map((c) => c.id)).toEqual(['keep']);
		expect(db.select().from(schema.contact).all()[0].description).toBe('the merged one');
	});

	it('keeps a member pointing at themselves when their record is the one merged away', () => {
		db.update(schema.user).set({ selfContactId: 'dup' }).where(eq(schema.user.id, U1)).run();
		db.update(schema.user).set({ selfContactId: 'keep' }).where(eq(schema.user.id, U2)).run();

		expect(merge()).toBe(true);

		const byUser = new Map(
			db.select().from(schema.user).all().map((u) => [u.id, u.selfContactId])
		);
		expect(byUser.get(U1)).toBe('keep');
		// positive control: the member already on the survivor is left where they were.
		expect(byUser.get(U2)).toBe('keep');
	});

	it('writes the merge to the log, in the same transaction', () => {
		expect(merge()).toBe(true);

		expect(db.select().from(schema.activityLog).all()[0]).toMatchObject({
			action: 'merge',
			entityId: 'dup',
			contactId: 'keep',
			summary: 'merged Duplicate Hans into Hans Müller'
		});
	});
});

describe('what would collide', () => {
	it('keeps a tag the survivor already had, and takes the one they did not', () => {
		db.insert(schema.tag).values([
			{ id: 't-both', householdId: H, name: 'Nachbarn', color: 'blue' },
			{ id: 't-only', householdId: H, name: 'Chor', color: 'green' }
		]).run();
		db.insert(schema.contactTag).values([
			{ contactId: 'keep', tagId: 't-both' },
			{ contactId: 'dup', tagId: 't-both' },
			{ contactId: 'dup', tagId: 't-only' }
		]).run();

		expect(merge()).toBe(true);

		const tags = db.select().from(schema.contactTag).all();
		expect(tags.map((t) => t.tagId).sort()).toEqual(['t-both', 't-only']);
		expect(tags.every((t) => t.contactId === 'keep')).toBe(true);
	});

	it('drops the link that ran between the two, which would now point at one person', () => {
		db.insert(schema.relationship)
			.values({ id: 'r-between', householdId: H, fromContactId: 'keep', toContactId: 'dup', typeId: 'friend', createdBy: U1 })
			.run();

		expect(merge()).toBe(true);

		expect(db.select().from(schema.relationship).all()).toHaveLength(0);
	});

	it('keeps one link where both records had the same one', () => {
		seedContact('lena', 'Lena');
		db.insert(schema.relationship)
			.values([
				{ id: 'r-keep', householdId: H, fromContactId: 'keep', toContactId: 'lena', typeId: 'parent_child', createdBy: U1 },
				{ id: 'r-dup', householdId: H, fromContactId: 'dup', toContactId: 'lena', typeId: 'parent_child', createdBy: U1 }
			])
			.run();

		expect(merge()).toBe(true);

		const rels = db.select().from(schema.relationship).all();
		expect(rels).toHaveLength(1);
		expect(rels[0]).toMatchObject({ id: 'r-keep', fromContactId: 'keep' });
	});

	it('brings a link of a different type across untouched', () => {
		// The positive control for the two above: nothing collides, so nothing is dropped.
		seedContact('lena', 'Lena');
		db.insert(schema.relationship)
			.values({ id: 'r-dup', householdId: H, fromContactId: 'dup', toContactId: 'lena', typeId: 'friend', createdBy: U1 })
			.run();

		expect(merge()).toBe(true);

		expect(db.select().from(schema.relationship).all()[0]).toMatchObject({
			id: 'r-dup',
			fromContactId: 'keep'
		});
	});

	it('joins two journal entries written about the same day, keeping both bodies', () => {
		// One entry per (contact, author, day, visibility), so the rows cannot both survive —
		// but neither may what somebody wrote.
		db.insert(schema.journalEntry)
			.values([
				{ id: 'j-keep', contactId: 'keep', createdBy: U1, visibility: 'shared', entryDate: '2026-05-01', body: 'saw him at the market' },
				{ id: 'j-dup', contactId: 'dup', createdBy: U1, visibility: 'shared', entryDate: '2026-05-01', body: 'he was buying pears' }
			])
			.run();
		db.insert(schema.photo)
			.values({ id: 'p-j', householdId: H, journalEntryId: 'j-dup', createdBy: U1, filePath: 'j.jpg', thumbPath: 'j-t.jpg', mime: 'image/jpeg' })
			.run();

		expect(merge()).toBe(true);

		const entries = db.select().from(schema.journalEntry).all();
		expect(entries).toHaveLength(1);
		expect(entries[0].body).toBe('saw him at the market\n\nhe was buying pears');
		// The picture inside the entry that was folded in comes along.
		expect(db.select().from(schema.photo).all()[0].journalEntryId).toBe('j-keep');
	});

	it('moves a journal entry whose day the survivor has nothing in', () => {
		db.insert(schema.journalEntry)
			.values([
				{ id: 'j-keep', contactId: 'keep', createdBy: U1, visibility: 'shared', entryDate: '2026-05-01', body: 'one day' },
				{ id: 'j-dup', contactId: 'dup', createdBy: U1, visibility: 'shared', entryDate: '2026-05-02', body: 'another day' }
			])
			.run();

		expect(merge()).toBe(true);

		const entries = db.select().from(schema.journalEntry).all();
		expect(entries).toHaveLength(2);
		expect(entries.every((e) => e.contactId === 'keep')).toBe(true);
	});

	it('leaves one membership where both records were in the same circle', () => {
		db.insert(schema.circle).values([
			{ id: 'c-both', householdId: H, name: 'Chor', kind: 'other', createdBy: U1 },
			{ id: 'c-only', householdId: H, name: 'Turnverein', kind: 'other', createdBy: U1 }
		]).run();
		db.insert(schema.circleMembership).values([
			{ id: 'm-keep', circleId: 'c-both', contactId: 'keep', createdBy: U1 },
			{ id: 'm-dup', circleId: 'c-both', contactId: 'dup', createdBy: U1 },
			{ id: 'm-other', circleId: 'c-only', contactId: 'dup', createdBy: U1 }
		]).run();

		expect(merge()).toBe(true);

		const memberships = db.select().from(schema.circleMembership).all();
		expect(memberships.map((m) => m.id).sort()).toEqual(['m-keep', 'm-other']);
		expect(memberships.every((m) => m.contactId === 'keep')).toBe(true);
	});

	it('keeps one mention where a note named both records', () => {
		db.insert(schema.note).values({ id: 'n1', contactId: 'keep', createdBy: U1, body: 'about them' }).run();
		db.insert(schema.noteMention).values([
			{ noteId: 'n1', contactId: 'keep' },
			{ noteId: 'n1', contactId: 'dup' }
		]).run();

		expect(merge()).toBe(true);

		expect(db.select().from(schema.noteMention).all()).toEqual([{ noteId: 'n1', contactId: 'keep' }]);
	});
});

describe('what it refuses', () => {
	it('refuses a record the viewer cannot see, and changes nothing', () => {
		seedContact('theirs', 'Theirs', 'private', U2);
		db.insert(schema.contactField).values({ id: 'f1', contactId: 'theirs', kind: 'phone', value: '079' }).run();

		expect(merge(viewer, 'keep', 'theirs')).toBe(false);
		expect(db.select().from(schema.contactField).all()[0].contactId).toBe('theirs');
		expect(db.select().from(schema.contact).all()).toHaveLength(3);
		expect(db.select().from(schema.activityLog).all()).toHaveLength(0);

		// positive control: the member who owns it can merge it.
		expect(merge(viewerU2, 'keep', 'theirs')).toBe(true);
		expect(db.select().from(schema.contactField).all()[0].contactId).toBe('keep');
	});

	it('refuses to merge a record into itself', () => {
		expect(merge(viewer, 'keep', 'keep')).toBe(false);
		expect(db.select().from(schema.contact).all()).toHaveLength(2);
	});
});
