import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { eq } from 'drizzle-orm';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import type { SourceLink } from '../domain/import/source-links';
import * as schema from './schema';
import {
	createDrizzleContactSourceRepository,
	writeSourceLinks
} from './contact-source-repository';

/*
 * Integration spec for the remembered answers of the matching review (docs/02 §2.16): they
 * belong to the household, they say nothing about a person the member may not browse, and the
 * people a card is matched against are only those the member may browse.
 */

const H = 'household-1';
const OTHER_H = 'household-2';
const ANNA = 'u-anna';
const BERT = 'u-bert';
const DORA = 'u-dora';
const asAnna: Viewer = { id: ANNA, householdId: H };
const asBert: Viewer = { id: BERT, householdId: H };
const asDora: Viewer = { id: DORA, householdId: OTHER_H };

let db: BunSQLiteDatabase<typeof schema>;
let repo: ReturnType<typeof createDrizzleContactSourceRepository>;

const answer = (externalUid: string, over: Partial<SourceLink>): SourceLink => ({
	source: 'vcard:google',
	externalUid,
	contactId: null,
	state: 'skipped',
	cardName: 'Somebody',
	cardHash: `hash-${externalUid}`,
	answeredBy: ANNA,
	answeredAt: 5,
	...over
});
const linked = (externalUid: string, contactId: string, over: Partial<SourceLink> = {}) =>
	answer(externalUid, { contactId, state: 'linked', ...over });
const skipped = (externalUid: string, over: Partial<SourceLink> = {}) => answer(externalUid, over);

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
			{ id: BERT, householdId: H, email: 'bert@example.test', name: 'Bert' },
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
				nickname: 'Anni',
				company: 'Example AG',
				jobTitle: 'Engineer',
				birthDate: '--04-07',
				birthDatePrecision: 'month_day',
				avatarPhotoId: 'ph-1'
			}),
			person('c-bruno', { firstName: 'Bruno', displayName: 'Bruno' }),
			person('c-annas-own', { visibility: 'private' }),
			person('c-berts-own', { visibility: 'private', createdBy: BERT }),
			person('c-archived', { archivedAt: 7 }),
			person('c-elsewhere', { householdId: OTHER_H, createdBy: DORA })
		])
		.run();
	db.insert(schema.contactField)
		.values([
			{ id: 'f1', contactId: 'c-anna', kind: 'email', value: 'anna.example@example.org' },
			{ id: 'f2', contactId: 'c-anna', kind: 'phone', value: '+41 79 000 00 01' }
		])
		.run();
	db.insert(schema.home)
		.values({ id: 'h1', householdId: H, value: 'Examplestrasse 1, 3007 Bern', createdBy: ANNA })
		.run();
	db.insert(schema.homeMember).values({ homeId: 'h1', contactId: 'c-anna', createdBy: ANNA }).run();
	db.insert(schema.tag).values({ id: 't1', householdId: H, name: 'Family' }).run();
	db.insert(schema.contactTag).values({ contactId: 'c-anna', tagId: 't1' }).run();
	repo = createDrizzleContactSourceRepository(db);
});

describe('createDrizzleContactSourceRepository', () => {
	it('matches against the people the member may browse, with what the merge plan compares', async () => {
		const people = await repo.matchablePeople(asAnna);

		expect(people.map((p) => p.id).sort()).toEqual(['c-anna', 'c-annas-own', 'c-bruno']);
		expect(people.find((p) => p.id === 'c-anna')).toEqual({
			id: 'c-anna',
			firstName: 'Anna',
			lastName: 'Example',
			displayName: 'Anna Example',
			nickname: 'Anni',
			company: 'Example AG',
			jobTitle: 'Engineer',
			birthday: { value: '--04-07', precision: 'month_day' },
			hasPhoto: true,
			fields: [
				{ kind: 'email', value: 'anna.example@example.org' },
				{ kind: 'phone', value: '+41 79 000 00 01' }
			],
			homeLines: ['Examplestrasse 1, 3007 Bern'],
			tags: ['Family']
		});
		expect(people.find((p) => p.id === 'c-bruno')).toMatchObject({
			birthday: null,
			hasPhoto: false,
			fields: [],
			homeLines: [],
			tags: []
		});
	});

	it('matches the linked book’s cards against shared people only, not even one’s own private', async () => {
		const people = await repo.matchablePeople(asAnna, { sharedOnly: true });

		expect(people.map((p) => p.id).sort()).toEqual(['c-anna', 'c-bruno']);
	});

	it('remembers answers per household and source, the latest one winning', async () => {
		writeSourceLinks(db, H, [linked('k1', 'c-anna'), skipped('k2')]);
		writeSourceLinks(db, H, [linked('k1', 'c-bruno', { cardHash: 'newer' })]);
		writeSourceLinks(db, H, [linked('k1', 'c-anna', { source: 'vcard:nextcloud' })]);

		expect(await repo.answersFor(asAnna, 'vcard:google')).toEqual(
			new Map([
				['k1', { state: 'linked', personId: 'c-bruno', cardHash: 'newer' }],
				['k2', { state: 'skipped' }]
			])
		);
		expect((await repo.answersFor(asAnna, 'vcard:nextcloud')).size).toBe(1);
		expect((await repo.answersFor(asDora, 'vcard:google')).size).toBe(0);
	});

	it('says only that a card is taken care of when its person is out of the member’s reach', async () => {
		writeSourceLinks(db, H, [
			linked('k-private', 'c-berts-own', { answeredBy: BERT }),
			linked('k-archived', 'c-archived')
		]);

		expect(await repo.answersFor(asAnna, 'vcard:google')).toEqual(
			new Map([
				['k-private', { state: 'out-of-reach' }],
				['k-archived', { state: 'out-of-reach' }]
			])
		);
		expect((await repo.answersFor(asBert, 'vcard:google')).get('k-private')).toEqual({
			state: 'linked',
			personId: 'c-berts-own',
			cardHash: 'hash-k-private'
		});
	});

	it('forgets the answer with the person it named', async () => {
		writeSourceLinks(db, H, [linked('k1', 'c-bruno')]);
		db.delete(schema.contact).where(eq(schema.contact.id, 'c-bruno')).run();

		expect((await repo.answersFor(asAnna, 'vcard:google')).size).toBe(0);
	});

	it('refuses a link without a person and a skip with one', () => {
		expect(() =>
			writeSourceLinks(db, H, [{ ...linked('k1', 'c-anna'), contactId: null }])
		).toThrow();
		expect(() => writeSourceLinks(db, H, [{ ...skipped('k2'), contactId: 'c-anna' }])).toThrow();
	});

	it('lists the household’s skipped cards, newest first, whoever skipped them', async () => {
		writeSourceLinks(db, H, [
			skipped('k1', { cardName: 'Felix Neu', answeredAt: 5 }),
			skipped('k2', { cardName: 'Gina Alt', answeredAt: 9, answeredBy: BERT }),
			linked('k3', 'c-anna')
		]);

		expect(await repo.skippedFor(asAnna)).toEqual([
			{
				source: 'vcard:google',
				externalUid: 'k2',
				cardName: 'Gina Alt',
				answeredBy: BERT,
				answeredAt: 9
			},
			{
				source: 'vcard:google',
				externalUid: 'k1',
				cardName: 'Felix Neu',
				answeredBy: ANNA,
				answeredAt: 5
			}
		]);
		expect(await repo.skippedFor(asDora)).toEqual([]);
	});

	it('asks again about a skipped card, and only a skipped one of the household', async () => {
		writeSourceLinks(db, H, [skipped('k1'), linked('k2', 'c-anna')]);

		expect(await repo.askAgain(asDora, 'vcard:google', 'k1')).toBe(false);
		expect(await repo.askAgain(asBert, 'vcard:google', 'k2')).toBe(false);
		expect(await repo.askAgain(asBert, 'vcard:google', 'k1')).toBe(true);
		expect([...(await repo.answersFor(asAnna, 'vcard:google')).keys()]).toEqual(['k2']);
	});
});
