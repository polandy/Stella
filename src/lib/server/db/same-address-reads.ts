import { and, asc, eq } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { contactBrowsableBy } from '../access/query-scoping';
import type { HomeAtLine } from '../../people/same-address-check';
import type { SameAddressSource } from '../domain/homes/same-address';
import type * as schema from './schema';
import { contact, contactField, home, homeMember } from './schema';

/*
 * Drizzle adapter for what *Data quality → Same address* reads (docs/02 §2.17): everyone the
 * viewer may browse, their own address lines, and the homes they live in. Scoped through the
 * central `contactBrowsableBy` — archived people are out, as on every list to act on — so a
 * private person the viewer does not own is never read, and a home's members are only ever
 * the ones the viewer may see.
 */

export function createDrizzleSameAddressSource(
	db: BunSQLiteDatabase<typeof schema>
): SameAddressSource {
	return {
		async loadVisibleTo(viewer) {
			const people = db
				.select({ id: contact.id, displayName: contact.displayName })
				.from(contact)
				.where(contactBrowsableBy(viewer))
				.all();
			const ownLines = db
				.select({
					contactId: contactField.contactId,
					fieldId: contactField.id,
					value: contactField.value,
					label: contactField.label,
					meta: contactField.meta
				})
				.from(contactField)
				.innerJoin(contact, eq(contact.id, contactField.contactId))
				.where(and(eq(contactField.kind, 'address'), contactBrowsableBy(viewer)))
				.orderBy(asc(contactField.sortOrder), asc(contactField.createdAt))
				.all();
			const rows = db
				.select({
					id: home.id,
					value: home.value,
					contactId: contact.id,
					displayName: contact.displayName
				})
				.from(home)
				.innerJoin(homeMember, eq(homeMember.homeId, home.id))
				.innerJoin(contact, eq(contact.id, homeMember.contactId))
				.where(and(eq(home.householdId, viewer.householdId), contactBrowsableBy(viewer)))
				.orderBy(asc(home.createdAt), asc(home.id))
				.all();

			const homes = new Map<string, HomeAtLine>();
			for (const row of rows) {
				const found = homes.get(row.id) ?? { id: row.id, value: row.value, livesHere: [] };
				found.livesHere.push({ id: row.contactId, displayName: row.displayName });
				homes.set(row.id, found);
			}
			return { people, ownLines, homes: [...homes.values()] };
		}
	};
}
