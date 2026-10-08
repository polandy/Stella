import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import type { NewActivityEntry } from '../domain/activity/activity';
import type { NewContact } from '../domain/contacts/contacts';
import * as schema from './schema';
import { createDrizzleContactDirectoryReads } from './contact-directory-reads';
import { createDrizzleContactRepository } from './contact-repository';

/*
 * Integration spec for the Drizzle ContactRepository adapter: the writes, and the one-record
 * reads they rest on, scoped via the central query-scoping (docs/03 §3.7, docs/08 §8.3). The
 * lists and names are read models of their own, specified in `contact-reads.test.ts`.
 */

const H1 = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const viewerU1: Viewer = { id: U1, householdId: H1 };
const viewerU2: Viewer = { id: U2, householdId: H1 };

let db: BunSQLiteDatabase<typeof schema>;
let repo: ReturnType<typeof createDrizzleContactRepository>;

const NOW = 1_700_000_000_000;
function contactInput(over: Partial<NewContact>): NewContact {
	return {
		id: 'c-x',
		householdId: H1,
		createdBy: U1,
		visibility: 'shared',
		displayName: 'X',
		firstName: null,
		lastName: null,
		nickname: null,
		description: null,
		birthDate: null,
		birthDatePrecision: 'full',
		gender: null,
		howWeMet: null,
		metDate: null,
		metPlace: null,
		createdAt: NOW,
		updatedAt: NOW,
		...over
	};
}

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	db.insert(schema.household).values({ id: H1, name: 'H' }).run();
	db.insert(schema.user)
		.values([
			{ id: U1, householdId: H1, email: 'u1@x.test', name: 'One' },
			{ id: U2, householdId: H1, email: 'u2@x.test', name: 'Two' }
		])
		.run();
	repo = createDrizzleContactRepository(db);
});

describe('createDrizzleContactRepository', () => {
	it('inserts and reads a contact back by id', async () => {
		await repo.insert(
			contactInput({ id: 'c-1', displayName: 'Hans Müller', firstName: 'Hans', lastName: 'Müller' })
		);
		const found = await repo.findByIdVisibleTo(viewerU1, 'c-1');
		expect(found).toMatchObject({
			id: 'c-1',
			displayName: 'Hans Müller',
			firstName: 'Hans',
			createdBy: U1
		});
	});

	it('round-trips the birth date and its precision', async () => {
		await repo.insert(
			contactInput({ id: 'c-born', birthDate: '--03-11', birthDatePrecision: 'month_day' })
		);
		expect(await repo.findByIdVisibleTo(viewerU1, 'c-born')).toMatchObject({
			birthDate: '--03-11',
			birthDatePrecision: 'month_day'
		});
	});

	it('round-trips the gender, and reads a value from before the three as not on record', async () => {
		await repo.insert(contactInput({ id: 'c-diverse', gender: 'diverse' }));
		await repo.insert(contactInput({ id: 'c-older' }));
		db.update(schema.contact)
			.set({ gender: 'genderfluid' })
			.where(eq(schema.contact.id, 'c-older'))
			.run();

		expect((await repo.findByIdVisibleTo(viewerU1, 'c-diverse'))?.gender).toBe('diverse');
		expect((await repo.findByIdVisibleTo(viewerU1, 'c-older'))?.gender).toBeNull();
	});

	it('reads the deceased flag back as a boolean, not SQLite 0/1', async () => {
		await repo.insert(contactInput({ id: 'c-alive' }));
		db.update(schema.contact).set({ isDeceased: 1 }).where(eq(schema.contact.id, 'c-alive')).run();
		const gone = await repo.findByIdVisibleTo(viewerU1, 'c-alive');
		expect(gone?.isDeceased).toBe(true);

		await repo.insert(contactInput({ id: 'c-living' }));
		// The positive control: without it, `toBe(true)` would pass against any truthy mapping.
		expect((await repo.findByIdVisibleTo(viewerU1, 'c-living'))?.isDeceased).toBe(false);
	});

	it('hides another member private contact but shows it to its owner', async () => {
		await repo.insert(
			contactInput({ id: 'c-priv', visibility: 'private', createdBy: U1, displayName: 'Secret' })
		);
		expect(await repo.findByIdVisibleTo(viewerU2, 'c-priv')).toBeNull();
		expect(await repo.findByIdVisibleTo(viewerU1, 'c-priv')).not.toBeNull();
	});
});

describe('editing the hero in place', () => {
	beforeEach(async () => {
		await repo.insert(
			contactInput({ id: 'c-shared', displayName: 'Bea', description: 'was this' })
		);
		await repo.insert(
			contactInput({ id: 'c-priv', visibility: 'private', displayName: 'Private' })
		);
	});

	it('renames a contact and rewords the description, leaving the rest alone', async () => {
		await repo.updateProfile('c-shared', {
			displayName: 'Renamed Person',
			description: 'Now says this',
			updatedAt: 999
		});

		const after = await repo.findByIdVisibleTo(viewerU1, 'c-shared');
		expect(after?.displayName).toBe('Renamed Person');
		expect(after?.description).toBe('Now says this');
		expect(after?.visibility).toBe('shared');
		expect(after?.updatedAt).toBe(999);
	});

	it('clears a description when it is written as null', async () => {
		await repo.updateProfile('c-shared', {
			displayName: 'Still Named',
			description: null,
			updatedAt: 1
		});

		expect((await repo.findByIdVisibleTo(viewerU1, 'c-shared'))?.description).toBeNull();
	});

	it('touches only the contact it names', async () => {
		const before = await repo.findByIdVisibleTo(viewerU1, 'c-priv');

		await repo.updateProfile('c-shared', {
			displayName: 'Only me',
			description: null,
			updatedAt: 2
		});

		expect(await repo.findByIdVisibleTo(viewerU1, 'c-priv')).toEqual(before!);
	});
});

describe('setting a gender', () => {
	beforeEach(async () => {
		await repo.insert(contactInput({ id: 'c-rosa', displayName: 'Rosa' }));
		await repo.insert(contactInput({ id: 'c-other', displayName: 'Other' }));
	});

	it('records a gender and stamps the change, then takes it off the record again', async () => {
		await repo.setGender('c-rosa', 'female', 500);
		expect(await repo.findByIdVisibleTo(viewerU1, 'c-rosa')).toMatchObject({
			gender: 'female',
			updatedAt: 500
		});

		await repo.setGender('c-rosa', null, 600);
		expect(await repo.findByIdVisibleTo(viewerU1, 'c-rosa')).toMatchObject({
			gender: null,
			updatedAt: 600
		});
	});

	it('touches only the contact it names', async () => {
		const before = await repo.findByIdVisibleTo(viewerU1, 'c-other');

		await repo.setGender('c-rosa', 'male', 2);

		expect((await repo.findByIdVisibleTo(viewerU1, 'c-rosa'))?.gender).toBe('male');
		expect(await repo.findByIdVisibleTo(viewerU1, 'c-other')).toEqual(before!);
	});
});

describe('setting a job', () => {
	beforeEach(async () => {
		await repo.insert(contactInput({ id: 'c-anna', displayName: 'Anna Keller' }));
		await repo.insert(contactInput({ id: 'c-other', displayName: 'Other' }));
	});

	it('records both fields and stamps the change, then takes them off the record again', async () => {
		await repo.setJob('c-anna', { jobTitle: 'Teacher', company: 'Primarschule Muri' }, 500);
		expect(await repo.findByIdVisibleTo(viewerU1, 'c-anna')).toMatchObject({
			jobTitle: 'Teacher',
			company: 'Primarschule Muri',
			updatedAt: 500
		});

		await repo.setJob('c-anna', { jobTitle: null, company: null }, 600);
		expect(await repo.findByIdVisibleTo(viewerU1, 'c-anna')).toMatchObject({
			jobTitle: null,
			company: null,
			updatedAt: 600
		});
	});

	it('lists the job with the person, so the directory can show it and find by it', async () => {
		await repo.setJob('c-anna', { jobTitle: 'Teacher', company: 'Primarschule Muri' }, 500);

		const listed = await createDrizzleContactDirectoryReads(db).listVisibleTo(viewerU1);

		expect(listed.find((c) => c.id === 'c-anna')).toMatchObject({
			jobTitle: 'Teacher',
			company: 'Primarschule Muri'
		});
		expect(listed.find((c) => c.id === 'c-other')).toMatchObject({ jobTitle: null, company: null });
	});

	it('touches only the contact it names', async () => {
		const before = await repo.findByIdVisibleTo(viewerU1, 'c-other');

		await repo.setJob('c-anna', { jobTitle: 'Teacher', company: null }, 2);

		expect((await repo.findByIdVisibleTo(viewerU1, 'c-anna'))?.jobTitle).toBe('Teacher');
		expect(await repo.findByIdVisibleTo(viewerU1, 'c-other')).toEqual(before!);
	});
});

describe('archiving', () => {
	beforeEach(async () => {
		await repo.insert(contactInput({ id: 'c-old', displayName: 'Old Neighbour' }));
		await repo.insert(contactInput({ id: 'c-here', displayName: 'Still Here' }));
	});

	it('stamps and clears archived_at, and reads it back', async () => {
		expect((await repo.findByIdVisibleTo(viewerU1, 'c-old'))?.archivedAt).toBeNull();

		await repo.setArchived('c-old', 1_700_000_000_000);
		expect((await repo.findByIdVisibleTo(viewerU1, 'c-old'))?.archivedAt).toBe(1_700_000_000_000);

		await repo.setArchived('c-old', null);
		expect((await repo.findByIdVisibleTo(viewerU1, 'c-old'))?.archivedAt).toBeNull();
	});

	it('leaves every other contact where they were', async () => {
		const before = await repo.findByIdVisibleTo(viewerU1, 'c-here');

		await repo.setArchived('c-old', 1_700_000_000_000);

		expect(await repo.findByIdVisibleTo(viewerU1, 'c-here')).toEqual(before!);
	});

	// An archived contact still opens: the page is where they are brought back from.
	it('still finds an archived contact by id', async () => {
		await repo.setArchived('c-old', 1_700_000_000_000);

		expect((await repo.findByIdVisibleTo(viewerU1, 'c-old'))?.displayName).toBe('Old Neighbour');
	});
});

/*
 * Deleting a person for good (docs/02 §2.2): the row goes with everything hanging off it,
 * the bytes to unlink come back, and the log entry is written in the same transaction.
 */
describe('deleting a contact', () => {
	const audit = (over: Partial<NewActivityEntry> = {}): NewActivityEntry => ({
		id: 'log-1',
		householdId: H1,
		actorId: U1,
		action: 'delete',
		entityType: 'contact',
		entityId: 'c-gone',
		contactId: null,
		visibility: 'shared',
		summary: 'removed Gone Person',
		createdAt: 1_700_000_000_000,
		...over
	});

	beforeEach(async () => {
		await repo.insert(contactInput({ id: 'c-gone', displayName: 'Gone Person' }));
		await repo.insert(contactInput({ id: 'c-stays', displayName: 'Stays Here' }));
		db.insert(schema.note)
			.values({
				id: 'n-1',
				contactId: 'c-gone',
				createdBy: U1,
				visibility: 'shared',
				body: 'a note'
			})
			.run();
		db.insert(schema.journalEntry)
			.values({
				id: 'j-1',
				contactId: 'c-gone',
				createdBy: U1,
				visibility: 'shared',
				entryDate: '2025-01-01',
				body: 'an entry'
			})
			.run();
		db.insert(schema.photo)
			.values([
				{
					id: 'p-gallery',
					householdId: H1,
					contactId: 'c-gone',
					createdBy: U1,
					filePath: 'g.jpg',
					thumbPath: 'g-t.jpg',
					mime: 'image/jpeg'
				},
				{
					id: 'p-journal',
					householdId: H1,
					journalEntryId: 'j-1',
					createdBy: U1,
					filePath: 'j.jpg',
					thumbPath: 'j-t.jpg',
					mime: 'image/jpeg'
				},
				{
					id: 'p-other',
					householdId: H1,
					contactId: 'c-stays',
					createdBy: U1,
					filePath: 'o.jpg',
					thumbPath: 'o-t.jpg',
					mime: 'image/jpeg'
				}
			])
			.run();
	});

	it('takes everything that hung off them, and nobody else', async () => {
		expect(await repo.deleteVisibleTo(viewerU1, 'c-gone', audit())).not.toBeNull();

		expect(await repo.findByIdVisibleTo(viewerU1, 'c-gone')).toBeNull();
		expect(db.select().from(schema.note).all()).toHaveLength(0);
		expect(db.select().from(schema.journalEntry).all()).toHaveLength(0);
		// positive control: the other person and their photo are untouched.
		expect((await repo.findByIdVisibleTo(viewerU1, 'c-stays'))?.displayName).toBe('Stays Here');
		expect(
			db
				.select()
				.from(schema.photo)
				.all()
				.map((p) => p.id)
		).toEqual(['p-other']);
	});

	it('hands back the bytes of their gallery *and* their journal photos', async () => {
		// The journal entry cascades with the contact, so its photo would leave orphaned
		// bytes behind if only the gallery were collected.
		const files = await repo.deleteVisibleTo(viewerU1, 'c-gone', audit());

		expect(files?.map((f) => f.filePath).sort()).toEqual(['g.jpg', 'j.jpg']);
		expect(files?.map((f) => f.thumbPath).sort()).toEqual(['g-t.jpg', 'j-t.jpg']);
	});

	it('deletes someone who is wearing one of their own photos', async () => {
		// The photos go before the contact, so this is the shape that would break first:
		// `contact.avatar_photo_id` still points at the row being deleted.
		db.update(schema.contact)
			.set({ avatarPhotoId: 'p-gallery' })
			.where(eq(schema.contact.id, 'c-gone'))
			.run();

		expect(await repo.deleteVisibleTo(viewerU1, 'c-gone', audit())).not.toBeNull();
		expect(await repo.findByIdVisibleTo(viewerU1, 'c-gone')).toBeNull();
	});

	it('lets go of the member who said they are this person, and only them', async () => {
		db.update(schema.user).set({ selfContactId: 'c-gone' }).where(eq(schema.user.id, U1)).run();
		db.update(schema.user).set({ selfContactId: 'c-stays' }).where(eq(schema.user.id, U2)).run();

		expect(await repo.deleteVisibleTo(viewerU1, 'c-gone', audit())).not.toBeNull();

		const byUser = new Map(
			db
				.select()
				.from(schema.user)
				.all()
				.map((u) => [u.id, u.selfContactId])
		);
		expect(byUser.get(U1)).toBeNull();
		// positive control: the member pointing at somebody else still does.
		expect(byUser.get(U2)).toBe('c-stays');
	});

	it('writes the log entry that outlives the row', async () => {
		await repo.deleteVisibleTo(viewerU1, 'c-gone', audit());

		const logged = db.select().from(schema.activityLog).all();
		expect(logged).toHaveLength(1);
		expect(logged[0]).toMatchObject({
			action: 'delete',
			entityType: 'contact',
			entityId: 'c-gone',
			summary: 'removed Gone Person',
			visibility: 'shared'
		});
	});

	it('deletes nothing, and logs nothing, for a contact the viewer may not see', async () => {
		await repo.insert(
			contactInput({ id: 'c-theirs', visibility: 'private', createdBy: U2, displayName: 'Theirs' })
		);

		expect(
			await repo.deleteVisibleTo(viewerU1, 'c-theirs', audit({ entityId: 'c-theirs' }))
		).toBeNull();
		expect((await repo.findByIdVisibleTo(viewerU2, 'c-theirs'))?.displayName).toBe('Theirs');
		expect(db.select().from(schema.activityLog).all()).toHaveLength(0);

		// positive control: their owner can delete them, and that does write a log row.
		expect(
			await repo.deleteVisibleTo(viewerU2, 'c-theirs', audit({ entityId: 'c-theirs' }))
		).not.toBeNull();
		expect(db.select().from(schema.activityLog).all()).toHaveLength(1);
	});
});

/*
 * Reads that answer for a handful of people, or with one number, where a page used to read
 * the whole household and look the few up or count them itself (docs/04 §4.8).
 */
describe('writeNames', () => {
	const write = (id: string, lastName: string) => ({
		id,
		displayName: `Lea ${lastName}`,
		firstName: 'Lea',
		lastName,
		nickname: null,
		formerName: null,
		updatedAt: NOW + 1
	});

	it('writes every name of a batch and its log entry together', async () => {
		await repo.insert(contactInput({ id: 'lea', displayName: 'Lea', firstName: 'Lea' }));
		await repo.insert(contactInput({ id: 'max', displayName: 'Max', firstName: 'Max' }));
		const audit: NewActivityEntry = {
			id: 'log-1',
			householdId: H1,
			actorId: U1,
			action: 'update',
			entityType: 'last_name',
			entityId: 'lea',
			contactId: null,
			visibility: 'shared',
			summary: 'set the last name Brunner on 2 people',
			createdAt: NOW + 1
		};

		await repo.writeNames(
			[
				write('lea', 'Brunner'),
				{ ...write('max', 'Brunner'), firstName: 'Max', displayName: 'Max Brunner' }
			],
			audit
		);

		expect((await repo.findByIdVisibleTo(viewerU1, 'lea'))?.displayName).toBe('Lea Brunner');
		expect((await repo.findByIdVisibleTo(viewerU1, 'max'))?.lastName).toBe('Brunner');
		expect(
			db
				.select()
				.from(schema.activityLog)
				.all()
				.map((row) => row.summary)
		).toEqual(['set the last name Brunner on 2 people']);
	});

	it('keeps a former name it is given', async () => {
		await repo.insert(
			contactInput({ id: 'lea', displayName: 'Lea Meier', firstName: 'Lea', lastName: 'Meier' })
		);

		await repo.writeNames([{ ...write('lea', 'Brunner'), formerName: 'Meier' }], null);

		expect(await repo.findByIdVisibleTo(viewerU1, 'lea')).toMatchObject({
			lastName: 'Brunner',
			formerName: 'Meier'
		});
		expect(db.select().from(schema.activityLog).all()).toEqual([]);
	});
});

/*
 * The owner's case from the preview (docs/02 §2.2, ADR-106): Franziska — first name
 * Franziska, no last name, shown as "Franziska" — given Widmer by a batch must read "Franziska
 * Widmer". Driven through the real adapter and the use-case, the way the batch action runs it.
 */
describe('a batch over a first name alone', () => {
	it('makes the shown name again from the new parts', async () => {
		const { setLastNames } = await import('../domain/contacts/last-names');
		await repo.insert(
			contactInput({ id: 'franziska', displayName: 'Franziska', firstName: 'Franziska' })
		);
		const deps = {
			names: repo,
			clock: { now: () => NOW + 5 },
			ids: { next: () => 'log-franziska' }
		};

		const written = await setLastNames(
			deps,
			viewerU1,
			[{ contactId: 'franziska', lastName: 'Widmer', replace: false }],
			'de'
		);

		expect(written).toBe(1);
		expect(await repo.findByIdVisibleTo(viewerU1, 'franziska')).toMatchObject({
			displayName: 'Franziska Widmer',
			firstName: 'Franziska',
			lastName: 'Widmer'
		});
	});
});
