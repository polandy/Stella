import { and, eq, inArray, isNotNull, isNull, notInArray, or } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { contactBrowsableBy, contactVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type { ImportantDateRepository, NewImportantDate } from '../domain/dates/important-dates';
import type { UpcomingSource } from '../domain/dates/upcoming';
import type * as schema from './schema';
import { contact, importantDate } from './schema';
import { DAY_PRECISIONS } from '../../dates/partial-date';

/*
 * Drizzle adapter for the ImportantDateRepository port (docs/dev/08 §8.3). Dates have no
 * visibility of their own; every read joins the parent contact and is scoped through the
 * central `contactVisibleTo`, so a date is only ever returned with a contact the viewer sees.
 *
 * `listSourcesVisibleTo` unions two things the domain treats alike: the explicit rows, and
 * the birthdays derived from `contact.birth_date` — which is why a birthday is never stored
 * twice (docs/dev/02 §2.13). Only a birth date that names a day can become a birthday: an
 * estimated year (`age`/`year` precision, docs/dev/03 §3.4) is a fact about the person, not a
 * date to look forward to.
 */

/** SQLite has no boolean; these columns are 0/1. */
const asBool = (value: number) => value === 1;

export function createDrizzleImportantDateRepository(
	db: BunSQLiteDatabase<typeof schema>
): ImportantDateRepository {
	const columns = {
		id: importantDate.id,
		contactId: importantDate.contactId,
		kind: importantDate.kind,
		label: importantDate.label,
		date: importantDate.date,
		recursYearly: importantDate.recursYearly,
		remind: importantDate.remind,
		createdAt: importantDate.createdAt,
		updatedAt: importantDate.updatedAt
	};

	// A birth year alone (`year`/`age`), which a day or a new estimate may replace.
	const namesNoDay = notInArray(contact.birthDatePrecision, [...DAY_PRECISIONS]);

	return {
		async insert(d: NewImportantDate, options = {}) {
			db.transaction((tx) => {
				tx.insert(importantDate)
					.values({
						...d,
						recursYearly: d.recursYearly ? 1 : 0,
						remind: d.remind ? 1 : 0
					})
					.run();
				if (options.replacesBirthYear) {
					tx.update(contact)
						.set({ birthDate: null, birthDatePrecision: 'full', updatedAt: d.updatedAt })
						.where(and(eq(contact.id, d.contactId), namesNoDay))
						.run();
				}
			});
		},

		async setBirthYear(viewer: Viewer, contactId: string, year: string | null, updatedAt: number) {
			const written = db
				.update(contact)
				.set(
					year === null
						? { birthDate: null, birthDatePrecision: 'full', updatedAt }
						: { birthDate: year, birthDatePrecision: 'age', updatedAt }
				)
				.where(
					and(
						eq(contact.id, contactId),
						contactVisibleTo(viewer),
						or(isNull(contact.birthDate), namesNoDay)
					)
				)
				.returning({ id: contact.id })
				.all();
			return written.length > 0;
		},

		async listForContactVisibleTo(viewer: Viewer, contactId: string) {
			const rows = db
				.select(columns)
				.from(importantDate)
				.innerJoin(contact, eq(importantDate.contactId, contact.id))
				.where(and(eq(importantDate.contactId, contactId), contactVisibleTo(viewer)))
				.orderBy(importantDate.date)
				.all();
			return rows.map((r) => ({
				...r,
				recursYearly: asBool(r.recursYearly),
				remind: asBool(r.remind)
			}));
		},

		async remove(contactId: string, dateId: string) {
			db.delete(importantDate)
				.where(and(eq(importantDate.id, dateId), eq(importantDate.contactId, contactId)))
				.run();
		},

		async listSourcesVisibleTo(viewer: Viewer): Promise<UpcomingSource[]> {
			const explicit = db
				.select({
					...columns,
					contactName: contact.displayName,
					avatarPhotoId: contact.avatarPhotoId,
					isDeceased: contact.isDeceased
				})
				.from(importantDate)
				.innerJoin(contact, eq(importantDate.contactId, contact.id))
				.where(contactBrowsableBy(viewer))
				.all();

			const born = db
				.select({
					contactId: contact.id,
					contactName: contact.displayName,
					avatarPhotoId: contact.avatarPhotoId,
					isDeceased: contact.isDeceased,
					birthDate: contact.birthDate
				})
				.from(contact)
				.where(
					and(
						contactBrowsableBy(viewer),
						isNotNull(contact.birthDate),
						inArray(contact.birthDatePrecision, [...DAY_PRECISIONS])
					)
				)
				.all();

			return [
				...born.map((b): UpcomingSource => ({
					dateId: null,
					contactId: b.contactId,
					contactName: b.contactName,
					avatarPhotoId: b.avatarPhotoId,
					isDeceased: asBool(b.isDeceased),
					kind: 'birthday',
					label: null,
					date: b.birthDate!,
					recursYearly: true,
					remind: true,
					derived: true
				})),
				...explicit.map((e): UpcomingSource => ({
					dateId: e.id,
					contactId: e.contactId,
					contactName: e.contactName,
					avatarPhotoId: e.avatarPhotoId,
					isDeceased: asBool(e.isDeceased),
					kind: e.kind,
					label: e.label,
					date: e.date,
					recursYearly: asBool(e.recursYearly),
					remind: asBool(e.remind),
					derived: false
				}))
			];
		},

		async listBirthEstimatesVisibleTo(viewer: Viewer) {
			return db
				.select({
					contactId: contact.id,
					year: contact.birthDate,
					isDeceased: contact.isDeceased
				})
				.from(contact)
				.where(
					and(
						contactBrowsableBy(viewer),
						isNotNull(contact.birthDate),
						notInArray(contact.birthDatePrecision, [...DAY_PRECISIONS])
					)
				)
				.all()
				.map((row) => ({
					contactId: row.contactId,
					year: row.year!,
					isDeceased: asBool(row.isDeceased)
				}));
		}
	};
}
