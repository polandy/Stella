import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { asc, eq } from 'drizzle-orm';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import { ContactGoneError } from '../domain/contacts/require-visible';
import { applyContactReview, type CardAnswer } from '../domain/import/contact-review';
import { englishWording } from '../domain/import/monica/wording.fixture';
import { activityWording } from '../i18n/activity-wording';
import { createDrizzleContactReviewWriter } from './contact-review-writer';
import { createDrizzleContactSourceRepository } from './contact-source-repository';
import * as schema from './schema';

/*
 * Integration spec for applying the matching review (docs/02 §2.16) against a real schema: one
 * transaction writes the new people, what the people here gain, the remembered answers and one
 * activity row — or nothing at all — and a second run of the same export writes nothing.
 */

const H = 'household-1';
const ANNA = 'u-anna';
const BERT = 'u-bert';
const asAnna: Viewer = { id: ANNA, householdId: H };

const card = (...lines: string[]) =>
	['BEGIN:VCARD', 'VERSION:3.0', ...lines, 'END:VCARD'].join('\r\n');
const EXPORT = [
	card(
		'UID:anna-1',
		'FN:Anna Example',
		'N:Example;Anna;;;',
		'NICKNAME:Anni',
		'EMAIL:anna@example.org',
		'TEL;TYPE=CELL:+41 79 000 00 01',
		'CATEGORIES:family,Climbing'
	),
	card(
		'UID:felix-1',
		'FN:Felix Neu',
		'N:Neu;Felix;;;',
		'EMAIL:felix@example.org',
		'CATEGORIES:Climbing'
	),
	card('UID:gina-1', 'FN:Gina Alt', 'N:Alt;Gina;;;')
].join('\r\n');

const answers = new Map<string, CardAnswer>([
	['anna-1', { kind: 'same', personId: 'c-anna', takeCard: [] }],
	['felix-1', { kind: 'new' }],
	['gina-1', { kind: 'skip' }]
]);

let db: BunSQLiteDatabase<typeof schema>;

function review(answered: ReadonlyMap<string, CardAnswer>, viewer = asAnna) {
	let n = 0;
	return applyContactReview(
		{
			sources: createDrizzleContactSourceRepository(db),
			writer: createDrizzleContactReviewWriter(db, activityWording),
			clock: { now: () => 1_000 },
			ids: { next: () => `id-${++n}` }
		},
		{
			viewer,
			text: EXPORT,
			answers: answered,
			visibility: 'shared',
			wording: englishWording,
			locale: 'en'
		}
	);
}

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	db.insert(schema.household).values({ id: H, name: 'H' }).run();
	db.insert(schema.user)
		.values([
			{ id: ANNA, householdId: H, email: 'anna@example.test', name: 'Anna' },
			{ id: BERT, householdId: H, email: 'bert@example.test', name: 'Bert' }
		])
		.run();
	db.insert(schema.contact)
		.values({
			id: 'c-anna',
			householdId: H,
			createdBy: ANNA,
			visibility: 'shared',
			firstName: 'Anna',
			lastName: 'Example',
			displayName: 'Anna Example',
			updatedAt: 1
		})
		.run();
	db.insert(schema.contactField)
		.values({ id: 'f1', contactId: 'c-anna', kind: 'email', value: 'anna@example.org' })
		.run();
	db.insert(schema.tag).values({ id: 't-family', householdId: H, name: 'Family' }).run();
});

describe('createDrizzleContactReviewWriter', () => {
	it('writes the whole review in one go, with one activity row in the member’s language', async () => {
		const outcome = await review(answers);

		expect(outcome).toMatchObject({ added: 1, completed: 1, skipped: 1 });
		const annaNow = db.select().from(schema.contact).where(eq(schema.contact.id, 'c-anna')).get()!;
		expect(annaNow).toMatchObject({
			nickname: 'Anni',
			displayName: 'Anna “Anni” Example',
			updatedAt: 1_000
		});
		expect(
			db
				.select({
					kind: schema.contactField.kind,
					label: schema.contactField.label,
					value: schema.contactField.value
				})
				.from(schema.contactField)
				.where(eq(schema.contactField.contactId, 'c-anna'))
				.orderBy(asc(schema.contactField.sortOrder))
				.all()
		).toEqual([
			{ kind: 'email', label: null, value: 'anna@example.org' },
			{ kind: 'phone', label: 'Mobile', value: '+41 79 000 00 01' }
		]);

		// The household's *Family* is reused whatever its case; *Climbing* is made once for both.
		const tags = db.select({ id: schema.tag.id, name: schema.tag.name }).from(schema.tag).all();
		expect(tags.map((t) => t.name).sort()).toEqual(['Climbing', 'Family']);
		const tagged = db
			.select({ contactId: schema.contactTag.contactId, name: schema.tag.name })
			.from(schema.contactTag)
			.innerJoin(schema.tag, eq(schema.tag.id, schema.contactTag.tagId))
			.orderBy(asc(schema.contactTag.contactId), asc(schema.tag.name))
			.all();
		expect(tagged).toEqual([
			{ contactId: 'c-anna', name: 'Climbing' },
			{ contactId: 'c-anna', name: 'Family' },
			{ contactId: 'vcard:contact:felix-1', name: 'Climbing' }
		]);

		expect(
			db
				.select({
					uid: schema.contactSourceLink.externalUid,
					state: schema.contactSourceLink.state,
					contactId: schema.contactSourceLink.contactId
				})
				.from(schema.contactSourceLink)
				.orderBy(asc(schema.contactSourceLink.externalUid))
				.all()
		).toEqual([
			{ uid: 'anna-1', state: 'linked', contactId: 'c-anna' },
			{ uid: 'felix-1', state: 'linked', contactId: 'vcard:contact:felix-1' },
			{ uid: 'gina-1', state: 'skipped', contactId: null }
		]);

		const log = db.select().from(schema.activityLog).all();
		expect(log).toHaveLength(1);
		expect(log[0]).toMatchObject({
			actorId: ANNA,
			action: 'import',
			summary: 'imported 1 person and added contact details to 1 person from a vCard file'
		});
	});

	it('writes nothing again on a second run of the same export', async () => {
		await review(answers);

		const again = await review(new Map());

		expect(again).toMatchObject({ added: 0, completed: 0, skipped: 0 });
		expect(db.select().from(schema.activityLog).all()).toHaveLength(1);
		expect(
			db.select().from(schema.contactField).where(eq(schema.contactField.contactId, 'c-anna')).all()
		).toHaveLength(2);
	});

	it('refuses the whole review when a person it names went out of reach meanwhile', async () => {
		const sources = createDrizzleContactSourceRepository(db);
		const people = await sources.matchablePeople(asAnna);
		// Between reading the people and writing, Anna's person is made private to Bert.
		db.update(schema.contact)
			.set({ visibility: 'private', createdBy: BERT })
			.where(eq(schema.contact.id, 'c-anna'))
			.run();
		const writer = createDrizzleContactReviewWriter(db, activityWording);
		let n = 0;

		const applying = applyContactReview(
			{
				sources: { ...sources, matchablePeople: async () => people },
				writer,
				clock: { now: () => 1_000 },
				ids: { next: () => `id-${++n}` }
			},
			{
				viewer: asAnna,
				text: EXPORT,
				answers,
				visibility: 'shared',
				wording: englishWording,
				locale: 'en'
			}
		);

		await expect(applying).rejects.toBeInstanceOf(ContactGoneError);
		expect(db.select().from(schema.contactSourceLink).all()).toEqual([]);
		expect(
			db.select().from(schema.contact).where(eq(schema.contact.id, 'vcard:contact:felix-1')).all()
		).toEqual([]);
		expect(db.select().from(schema.activityLog).all()).toEqual([]);
	});
});
