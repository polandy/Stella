import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { StellaPerson } from '../../import-match/card';
import { contactBrowsableBy } from '../access/query-scoping';
import type {
	ContactSourceRepository,
	RememberedAnswer,
	SourceLink
} from '../domain/import/source-links';
import type * as schema from './schema';
import {
	contact,
	contactField,
	contactSourceLink,
	contactTag,
	home,
	homeMember,
	tag
} from './schema';

/*
 * The remembered answers of the matching review (docs/02 §2.16, docs/03 `contact_source_link`)
 * and the people a card is matched against. Answers belong to the household; what one may
 * say follows the person it names, through `contactBrowsableBy`.
 */

type Db = BunSQLiteDatabase<typeof schema>;

/**
 * Write answers, the latest one for a card replacing the one before. Takes the handle it is
 * given, so the review's apply writes them in the transaction that writes the people.
 */
export function writeSourceLinks(db: Db, householdId: string, links: readonly SourceLink[]): void {
	for (const link of links) {
		const row = { householdId, ...link };
		db.insert(contactSourceLink)
			.values(row)
			.onConflictDoUpdate({
				target: [
					contactSourceLink.householdId,
					contactSourceLink.source,
					contactSourceLink.externalUid
				],
				set: {
					contactId: row.contactId,
					state: row.state,
					cardName: row.cardName,
					cardHash: row.cardHash,
					answeredBy: row.answeredBy,
					answeredAt: row.answeredAt
				}
			})
			.run();
	}
}

/** Rows of one person each, gathered per person in row order. */
function grouped<T>(rows: readonly { contactId: string; item: T }[]): Map<string, T[]> {
	const byId = new Map<string, T[]>();
	for (const { contactId, item } of rows)
		byId.set(contactId, [...(byId.get(contactId) ?? []), item]);
	return byId;
}

export function createDrizzleContactSourceRepository(db: Db): ContactSourceRepository {
	return {
		async answersFor(viewer, source) {
			const rows = db
				.select({
					externalUid: contactSourceLink.externalUid,
					state: contactSourceLink.state,
					contactId: contactSourceLink.contactId,
					cardHash: contactSourceLink.cardHash,
					// Whether the member may browse the person the answer names; never the person itself.
					browsable: sql<number>`${contact.id} IS NOT NULL`
				})
				.from(contactSourceLink)
				.leftJoin(
					contact,
					and(eq(contact.id, contactSourceLink.contactId), contactBrowsableBy(viewer))
				)
				.where(
					and(
						eq(contactSourceLink.householdId, viewer.householdId),
						eq(contactSourceLink.source, source)
					)
				)
				.all();
			return new Map(
				rows.map((row): [string, RememberedAnswer] => {
					if (row.state === 'skipped') return [row.externalUid, { state: 'skipped' }];
					if (!row.browsable || row.contactId === null)
						return [row.externalUid, { state: 'out-of-reach' }];
					return [
						row.externalUid,
						{ state: 'linked', personId: row.contactId, cardHash: row.cardHash }
					];
				})
			);
		},

		async matchablePeople(viewer) {
			const browsable = contactBrowsableBy(viewer);
			const people = db
				.select({
					id: contact.id,
					firstName: contact.firstName,
					lastName: contact.lastName,
					displayName: contact.displayName,
					nickname: contact.nickname,
					company: contact.company,
					jobTitle: contact.jobTitle,
					birthDate: contact.birthDate,
					birthDatePrecision: contact.birthDatePrecision,
					avatarPhotoId: contact.avatarPhotoId
				})
				.from(contact)
				.where(browsable)
				.all();
			const fields = grouped(
				db
					.select({
						contactId: contactField.contactId,
						item: { kind: contactField.kind, value: contactField.value }
					})
					.from(contactField)
					.innerJoin(contact, eq(contact.id, contactField.contactId))
					.where(browsable)
					.orderBy(asc(contactField.sortOrder), asc(contactField.id))
					.all()
			);
			const homeLines = grouped(
				db
					.select({ contactId: homeMember.contactId, item: home.value })
					.from(homeMember)
					.innerJoin(home, eq(home.id, homeMember.homeId))
					.innerJoin(contact, eq(contact.id, homeMember.contactId))
					.where(browsable)
					.all()
			);
			const tags = grouped(
				db
					.select({ contactId: contactTag.contactId, item: tag.name })
					.from(contactTag)
					.innerJoin(tag, eq(tag.id, contactTag.tagId))
					.innerJoin(contact, eq(contact.id, contactTag.contactId))
					.where(browsable)
					.orderBy(asc(tag.name))
					.all()
			);
			return people.map(
				({ birthDate, birthDatePrecision, avatarPhotoId, ...person }): StellaPerson => ({
					...person,
					birthday: birthDate === null ? null : { value: birthDate, precision: birthDatePrecision },
					hasPhoto: avatarPhotoId !== null,
					fields: fields.get(person.id) ?? [],
					homeLines: homeLines.get(person.id) ?? [],
					tags: tags.get(person.id) ?? []
				})
			);
		},

		async skippedFor(viewer) {
			return db
				.select({
					source: contactSourceLink.source,
					externalUid: contactSourceLink.externalUid,
					cardName: contactSourceLink.cardName,
					answeredBy: contactSourceLink.answeredBy,
					answeredAt: contactSourceLink.answeredAt
				})
				.from(contactSourceLink)
				.where(
					and(
						eq(contactSourceLink.householdId, viewer.householdId),
						eq(contactSourceLink.state, 'skipped')
					)
				)
				.orderBy(desc(contactSourceLink.answeredAt), asc(contactSourceLink.cardName))
				.all();
		},

		async askAgain(viewer, source, externalUid) {
			const forgotten = db
				.delete(contactSourceLink)
				.where(
					and(
						eq(contactSourceLink.householdId, viewer.householdId),
						eq(contactSourceLink.source, source),
						eq(contactSourceLink.externalUid, externalUid),
						eq(contactSourceLink.state, 'skipped')
					)
				)
				.returning({ externalUid: contactSourceLink.externalUid })
				.all();
			return forgotten.length > 0;
		}
	};
}
