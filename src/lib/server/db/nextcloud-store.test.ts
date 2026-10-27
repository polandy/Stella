import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { ContactSource, NextcloudSource } from '../../import-match/card';
import type { Viewer } from '../access/visibility';
import { writeSourceLinks } from './contact-source-repository';
import { createDrizzleNextcloudStore } from './nextcloud-store';
import * as schema from './schema';

/*
 * Integration spec for what the Nextcloud sync keeps (docs/02 §2.16.3): the token, the mirror,
 * the links it reads people through and the conflicts — never about a private or archived
 * person, and never across households.
 */

const H = 'household-1';
const OTHER_H = 'household-2';
const ANNA = 'u-anna';
const SYSTEM = 'u-nextcloud';
const DORA = 'u-dora';
const BOOK: NextcloudSource = 'nextcloud:family/contacts';
const asAnna: Viewer = { id: ANNA, householdId: H };
const asSystem: Viewer = { id: SYSTEM, householdId: H };
const asDora: Viewer = { id: DORA, householdId: OTHER_H };

let db: BunSQLiteDatabase<typeof schema>;
let store: ReturnType<typeof createDrizzleNextcloudStore>;

const card = (uid: string, over: { etag?: string; vcard?: string } = {}) => ({
	href: `${uid}.vcf`,
	uid,
	etag: 'e1',
	vcard: `BEGIN:VCARD\r\nUID:${uid}\r\nEND:VCARD\r\n`,
	...over
});

function link(uid: string, contactId: string, source: ContactSource = BOOK) {
	writeSourceLinks(db, H, [
		{
			source,
			externalUid: uid,
			contactId,
			state: 'linked',
			cardName: uid,
			cardHash: 'h',
			answeredBy: ANNA,
			answeredAt: 1
		}
	]);
}

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	db.insert(schema.household)
		.values([
			{ id: H, name: 'H' },
			{ id: OTHER_H, name: 'Other' }
		])
		.run();
	db.insert(schema.user)
		.values([
			{ id: ANNA, householdId: H, email: 'anna@example.test', name: 'Anna' },
			{
				id: SYSTEM,
				householdId: H,
				email: 'nextcloud@h.invalid',
				name: 'Nextcloud',
				kind: 'system'
			},
			{ id: DORA, householdId: OTHER_H, email: 'dora@example.test', name: 'Dora' }
		])
		.run();
	const person = (id: string, over: Partial<typeof schema.contact.$inferInsert> = {}) => ({
		id,
		householdId: H,
		createdBy: ANNA,
		visibility: 'shared' as const,
		displayName: id,
		...over
	});
	db.insert(schema.contact)
		.values([
			person('c-anna', {
				firstName: 'Anna',
				lastName: 'Example',
				displayName: 'Anna Example',
				birthDate: '1950-04-07',
				birthDatePrecision: 'full',
				avatarPhotoId: 'ph-anna'
			}),
			person('c-bruno', { displayName: 'Bruno', avatarPhotoId: 'ph-bruno' }),
			person('c-private', { visibility: 'private' }),
			person('c-archived', { archivedAt: 7 })
		])
		.run();
	db.insert(schema.photo)
		.values([
			{
				id: 'ph-anna',
				householdId: H,
				contactId: 'c-anna',
				createdBy: ANNA,
				filePath: 'anna.jpg',
				thumbPath: 'anna-t.jpg',
				mime: 'image/jpeg'
			},
			{
				id: 'ph-bruno',
				householdId: H,
				contactId: 'c-bruno',
				createdBy: ANNA,
				visibility: 'private',
				filePath: 'bruno.jpg',
				thumbPath: 'bruno-t.jpg',
				mime: 'image/jpeg'
			}
		])
		.run();
	db.insert(schema.contactField)
		.values([
			{ id: 'f2', contactId: 'c-anna', kind: 'phone', value: '+41 79 000 00 01', sortOrder: 1 },
			{ id: 'f1', contactId: 'c-anna', kind: 'email', value: 'a@example.org', label: 'Work' }
		])
		.run();
	db.insert(schema.home)
		.values({ id: 'h1', householdId: H, value: 'Examplestrasse 1, 3007 Bern', createdBy: ANNA })
		.run();
	db.insert(schema.homeMember).values({ homeId: 'h1', contactId: 'c-anna', createdBy: ANNA }).run();
	db.insert(schema.tag).values({ id: 't1', householdId: H, name: 'Family' }).run();
	db.insert(schema.contactTag).values({ contactId: 'c-anna', tagId: 't1' }).run();
	store = createDrizzleNextcloudStore(db);
});

describe('createDrizzleNextcloudStore', () => {
	it('keeps where the last sync stopped, per household and book', async () => {
		expect(await store.syncToken(H, BOOK)).toBeNull();
		await store.saveSyncToken(H, BOOK, 't1', 10);
		await store.saveSyncToken(H, BOOK, 't2', 20);

		expect(await store.syncToken(H, BOOK)).toBe('t2');
		expect(await store.syncedAt(H, BOOK)).toBe(20);
		expect(await store.syncToken(OTHER_H, BOOK)).toBeNull();
	});

	it('holds a card again without forgetting when its person was last in step', async () => {
		await store.saveCard(H, BOOK, card('anna'));
		await store.setStellaHash(H, BOOK, 'anna.vcf', 's1');
		await store.saveCard(H, BOOK, card('anna', { etag: 'e2' }));

		expect(await store.cards(H, BOOK)).toEqual([
			{ ...card('anna', { etag: 'e2' }), stellaHash: 's1' }
		]);
		expect(await store.cards(OTHER_H, BOOK)).toEqual([]);
	});

	it('reads a linked person with their labelled fields, homes, tags and shared avatar', async () => {
		link('anna', 'c-anna');
		link('bruno', 'c-bruno');
		const people = await store.linkedPeople(asSystem, BOOK);

		expect(people.get('anna')).toEqual({
			id: 'c-anna',
			firstName: 'Anna',
			lastName: 'Example',
			displayName: 'Anna Example',
			nickname: null,
			company: null,
			jobTitle: null,
			birthday: { value: '1950-04-07', precision: 'full' },
			fields: [
				{ kind: 'email', value: 'a@example.org', label: 'Work' },
				{ kind: 'phone', value: '+41 79 000 00 01', label: null }
			],
			homeLines: ['Examplestrasse 1, 3007 Bern'],
			tags: ['Family'],
			hasPhoto: true,
			avatar: { photoId: 'ph-anna', path: 'anna.jpg', mime: 'image/jpeg' }
		});
		// A private picture never leaves for the book.
		expect(people.get('bruno')).toMatchObject({ hasPhoto: true, avatar: null });
	});

	it('never reads a private or archived person for the book, nor another household', async () => {
		link('private', 'c-private');
		link('archived', 'c-archived');
		link('anna', 'c-anna', 'vcard:google');

		expect([...(await store.linkedPeople(asSystem, BOOK)).keys()]).toEqual([]);
		expect((await store.linkedPeople(asDora, BOOK)).size).toBe(0);
	});

	it('drops a link to a private person, with their conflicts', async () => {
		link('private', 'c-private');
		link('anna', 'c-anna');
		await store.putConflicts(H, BOOK, 'c-private', [{ kind: 'photo' }], 5);

		expect(await store.unlinkPrivate(H, BOOK)).toBe(1);
		expect(
			db
				.select()
				.from(schema.contactSourceLink)
				.all()
				.map((l) => l.externalUid)
		).toEqual(['anna']);
		expect(db.select().from(schema.nextcloudConflict).all()).toEqual([]);
	});

	it('forgets a card gone from the book with its link, and keeps the person', async () => {
		link('anna', 'c-anna');
		await store.saveCard(H, BOOK, card('anna'));
		await store.saveCard(H, BOOK, card('nobody'));
		await store.putConflicts(H, BOOK, 'c-anna', [{ kind: 'photo' }], 5);

		expect(await store.dropCard(H, BOOK, 'anna.vcf')).toBe(true);
		expect(await store.dropCard(H, BOOK, 'nobody.vcf')).toBe(false);
		expect(await store.cards(H, BOOK)).toEqual([]);
		expect(db.select().from(schema.contactSourceLink).all()).toEqual([]);
		expect(await store.conflicts(asAnna)).toEqual([]);
		expect(
			db
				.select()
				.from(schema.contact)
				.all()
				.map((c) => c.id)
		).toContain('c-anna');
	});

	it('finds the card a person is linked to', async () => {
		link('anna', 'c-anna');
		await store.saveCard(H, BOOK, card('anna'));

		expect(await store.linkedCard(asAnna, 'c-anna')).toEqual({
			source: BOOK,
			card: { ...card('anna'), stellaHash: null }
		});
		expect(await store.linkedCard(asAnna, 'c-bruno')).toBeNull();
		expect(await store.linkedCard(asDora, 'c-anna')).toBeNull();
	});

	describe('conflicts', () => {
		it('keep each side as found, a newer one replacing the same fact', async () => {
			await store.putConflicts(
				H,
				BOOK,
				'c-anna',
				[
					{ kind: 'lastName', stella: 'Example', card: 'Old' },
					{
						kind: 'birthday',
						stella: { value: '1950-04-07', precision: 'full' },
						card: { value: '--04-08', precision: 'month_day' }
					}
				],
				5
			);
			await store.putConflicts(
				H,
				BOOK,
				'c-anna',
				[{ kind: 'lastName', stella: 'Example', card: 'Meier' }],
				6
			);
			await store.putConflicts(H, BOOK, 'c-bruno', [{ kind: 'photo' }], 1);

			expect(await store.conflicts(asAnna)).toEqual([
				{
					contactId: 'c-bruno',
					displayName: 'Bruno',
					source: BOOK,
					conflict: { kind: 'photo' },
					foundAt: 1
				},
				{
					contactId: 'c-anna',
					displayName: 'Anna Example',
					source: BOOK,
					conflict: {
						kind: 'birthday',
						stella: { value: '1950-04-07', precision: 'full' },
						card: { value: '--04-08', precision: 'month_day' }
					},
					foundAt: 5
				},
				{
					contactId: 'c-anna',
					displayName: 'Anna Example',
					source: BOOK,
					conflict: { kind: 'lastName', stella: 'Example', card: 'Meier' },
					foundAt: 6
				}
			]);
			expect(await store.conflicts(asDora)).toEqual([]);
		});

		it('are answered once, and only within the household', async () => {
			await store.putConflicts(H, BOOK, 'c-anna', [{ kind: 'photo' }], 5);

			expect(await store.removeConflict(asDora, 'c-anna', 'photo')).toBe(false);
			expect(await store.removeConflict(asAnna, 'c-anna', 'photo')).toBe(true);
			expect(await store.removeConflict(asAnna, 'c-anna', 'photo')).toBe(false);
		});

		it('about a private person are never shown, not even to the member who made them', async () => {
			link('private', 'c-private');
			await store.saveCard(H, BOOK, card('private'));
			await store.putConflicts(H, BOOK, 'c-private', [{ kind: 'photo' }], 5);

			expect(await store.conflicts(asAnna)).toEqual([]);
			expect(await store.removeConflict(asAnna, 'c-private', 'photo')).toBe(false);
			expect(await store.linkedCard(asAnna, 'c-private')).toBeNull();
			expect((await store.linkedPeople(asAnna, BOOK)).size).toBe(0);
		});

		it('about an archived person wait unseen', async () => {
			await store.putConflicts(H, BOOK, 'c-archived', [{ kind: 'photo' }], 5);

			expect(await store.conflicts(asAnna)).toEqual([]);
			expect(await store.removeConflict(asAnna, 'c-archived', 'photo')).toBe(false);
		});
	});
});
