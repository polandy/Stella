import { and, eq, isNotNull } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { contactVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type {
	ImportantDateRepository,
	NewImportantDate
} from '../domain/dates/important-dates';
import type { UpcomingSource } from '../domain/dates/upcoming';
import type * as schema from './schema';
import { contact, importantDate } from './schema';

/*
 * Drizzle adapter for the ImportantDateRepository port (docs/08 §8.3). Dates have no
 * visibility of their own; every read joins the parent contact and is scoped through the
 * central `contactVisibleTo`, so a date is only ever returned with a contact the viewer sees.
 *
 * `listSourcesVisibleTo` unions two things the domain treats alike: the explicit rows, and
 * the birthdays derived from `contact.birth_date` — which is why a birthday is never stored
 * twice (docs/02 §2.13).
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

	return {
		async insert(d: NewImportantDate) {
			db.insert(importantDate)
				.values({
					...d,
					recursYearly: d.recursYearly ? 1 : 0,
					remind: d.remind ? 1 : 0
				})
				.run();
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
				.where(contactVisibleTo(viewer))
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
				.where(and(contactVisibleTo(viewer), isNotNull(contact.birthDate)))
				.all();

			return [
				...born.map(
					(b): UpcomingSource => ({
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
					})
				),
				...explicit.map(
					(e): UpcomingSource => ({
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
					})
				)
			];
		}
	};
}
