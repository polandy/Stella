import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { PartialDate } from '../../dates/partial-date';
import type { NextcloudSource } from '../../import-match/card';
import { contactInBookFor } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type { NextcloudStore, StoredConflict } from '../domain/nextcloud/store';
import type { SyncConflict } from '../domain/nextcloud/sync-plan';
import { readLinkedPeople } from './nextcloud-linked-people';
import type * as schema from './schema';
import {
	contact,
	contactSourceLink,
	nextcloudCard,
	nextcloudConflict,
	nextcloudSync
} from './schema';

/*
 * What the Nextcloud sync keeps (docs/02 §2.16.3, docs/03 §3.3): the sync token, the mirror of
 * the book, and the waiting conflicts. Whom a link or a conflict may name follows the person,
 * through `contactInBookFor`: a private or archived person is never read for the book.
 */

type Db = BunSQLiteDatabase<typeof schema>;

const ofBook = (householdId: string, source: NextcloudSource) =>
	and(eq(nextcloudCard.householdId, householdId), eq(nextcloudCard.source, source));

/** The links of `source` that name a person. */
const linkedTo = (householdId: string, source: NextcloudSource) =>
	and(
		eq(contactSourceLink.householdId, householdId),
		eq(contactSourceLink.source, source),
		eq(contactSourceLink.state, 'linked')
	);

const conflictOf = (kind: SyncConflict['kind'], stella: string, card: string): SyncConflict => {
	switch (kind) {
		case 'photo':
			return { kind };
		case 'birthday':
			return {
				kind,
				stella: JSON.parse(stella) as PartialDate,
				card: JSON.parse(card) as PartialDate
			};
		default:
			return { kind, stella: JSON.parse(stella) as string, card: JSON.parse(card) as string };
	}
};

const sidesOf = (conflict: SyncConflict) =>
	conflict.kind === 'photo'
		? { stellaValue: 'null', cardValue: 'null' }
		: { stellaValue: JSON.stringify(conflict.stella), cardValue: JSON.stringify(conflict.card) };

export function createDrizzleNextcloudStore(db: Db): NextcloudStore {
	/** Forget the conflicts of the people named, in this book. */
	const dropConflicts = (source: NextcloudSource, contactIds: string[]) => {
		if (contactIds.length === 0) return;
		db.delete(nextcloudConflict)
			.where(
				and(eq(nextcloudConflict.source, source), inArray(nextcloudConflict.contactId, contactIds))
			)
			.run();
	};

	/** The ids of the people the book may hold for `viewer`, as a subquery. */
	const inBookIds = (viewer: Viewer) =>
		db.select({ id: contact.id }).from(contact).where(contactInBookFor(viewer));

	return {
		async syncToken(householdId, source) {
			const row = db
				.select({ token: nextcloudSync.syncToken })
				.from(nextcloudSync)
				.where(and(eq(nextcloudSync.householdId, householdId), eq(nextcloudSync.source, source)))
				.get();
			return row?.token ?? null;
		},

		async saveSyncToken(householdId, source, token, at) {
			db.insert(nextcloudSync)
				.values({ householdId, source, syncToken: token, syncedAt: at })
				.onConflictDoUpdate({
					target: [nextcloudSync.householdId, nextcloudSync.source],
					set: { syncToken: token, syncedAt: at }
				})
				.run();
		},

		async syncedAt(householdId, source) {
			const row = db
				.select({ at: nextcloudSync.syncedAt })
				.from(nextcloudSync)
				.where(and(eq(nextcloudSync.householdId, householdId), eq(nextcloudSync.source, source)))
				.get();
			return row?.at ?? null;
		},

		async cards(householdId, source) {
			return db
				.select({
					href: nextcloudCard.href,
					uid: nextcloudCard.uid,
					etag: nextcloudCard.etag,
					vcard: nextcloudCard.vcard,
					stellaHash: nextcloudCard.stellaHash
				})
				.from(nextcloudCard)
				.where(ofBook(householdId, source))
				.orderBy(asc(nextcloudCard.href))
				.all();
		},

		async saveCard(householdId, source, card) {
			db.insert(nextcloudCard)
				.values({ householdId, source, ...card })
				.onConflictDoUpdate({
					target: [nextcloudCard.householdId, nextcloudCard.source, nextcloudCard.href],
					set: { uid: card.uid, etag: card.etag, vcard: card.vcard }
				})
				.run();
		},

		async setStellaHash(householdId, source, href, hash) {
			db.update(nextcloudCard)
				.set({ stellaHash: hash })
				.where(and(ofBook(householdId, source), eq(nextcloudCard.href, href)))
				.run();
		},

		async dropCard(householdId, source, href) {
			return db.transaction((tx) => {
				const card = tx
					.delete(nextcloudCard)
					.where(and(ofBook(householdId, source), eq(nextcloudCard.href, href)))
					.returning({ uid: nextcloudCard.uid })
					.get();
				if (!card) return false;
				const links = tx
					.delete(contactSourceLink)
					.where(
						and(
							eq(contactSourceLink.householdId, householdId),
							eq(contactSourceLink.source, source),
							eq(contactSourceLink.externalUid, card.uid)
						)
					)
					.returning({ contactId: contactSourceLink.contactId })
					.all();
				const people = links.flatMap((l) => (l.contactId ? [l.contactId] : []));
				if (people.length > 0) {
					tx.delete(nextcloudConflict)
						.where(
							and(
								eq(nextcloudConflict.source, source),
								inArray(nextcloudConflict.contactId, people)
							)
						)
						.run();
				}
				return people.length > 0;
			});
		},

		async unlinkPrivate(householdId, source) {
			const privateIds = db
				.select({ id: contact.id })
				.from(contact)
				.where(and(eq(contact.householdId, householdId), eq(contact.visibility, 'private')));
			const dropped = db
				.delete(contactSourceLink)
				.where(and(linkedTo(householdId, source), inArray(contactSourceLink.contactId, privateIds)))
				.returning({ contactId: contactSourceLink.contactId })
				.all();
			dropConflicts(
				source,
				dropped.flatMap((d) => (d.contactId ? [d.contactId] : []))
			);
			return dropped.length;
		},

		async linkedCard(viewer, contactId) {
			const row = db
				.select({
					source: nextcloudCard.source,
					href: nextcloudCard.href,
					uid: nextcloudCard.uid,
					etag: nextcloudCard.etag,
					vcard: nextcloudCard.vcard,
					stellaHash: nextcloudCard.stellaHash
				})
				.from(contactSourceLink)
				.innerJoin(contact, eq(contact.id, contactSourceLink.contactId))
				.innerJoin(
					nextcloudCard,
					and(
						eq(nextcloudCard.householdId, contactSourceLink.householdId),
						eq(nextcloudCard.source, sql`${contactSourceLink.source}`),
						eq(nextcloudCard.uid, contactSourceLink.externalUid)
					)
				)
				.where(
					and(
						eq(contactSourceLink.contactId, contactId),
						eq(contactSourceLink.state, 'linked'),
						contactInBookFor(viewer)
					)
				)
				.get();
			if (!row) return null;
			const { source, ...card } = row;
			return { source, card };
		},

		async linkedPeople(viewer, source) {
			return readLinkedPeople(db, viewer, source);
		},

		async putConflicts(householdId, source, contactId, conflicts, at) {
			for (const conflict of conflicts) {
				const sides = sidesOf(conflict);
				db.insert(nextcloudConflict)
					.values({ contactId, kind: conflict.kind, householdId, source, ...sides, foundAt: at })
					.onConflictDoUpdate({
						target: [nextcloudConflict.contactId, nextcloudConflict.kind],
						set: { source, ...sides, foundAt: at }
					})
					.run();
			}
		},

		async conflicts(viewer) {
			const rows = db
				.select({
					contactId: nextcloudConflict.contactId,
					displayName: contact.displayName,
					source: nextcloudConflict.source,
					kind: nextcloudConflict.kind,
					stellaValue: nextcloudConflict.stellaValue,
					cardValue: nextcloudConflict.cardValue,
					foundAt: nextcloudConflict.foundAt
				})
				.from(nextcloudConflict)
				.innerJoin(contact, eq(contact.id, nextcloudConflict.contactId))
				.where(and(eq(nextcloudConflict.householdId, viewer.householdId), contactInBookFor(viewer)))
				.orderBy(
					asc(nextcloudConflict.foundAt),
					asc(contact.displayName),
					asc(nextcloudConflict.kind)
				)
				.all();
			return rows.map(({ kind, stellaValue, cardValue, ...row }): StoredConflict => ({
				...row,
				conflict: conflictOf(kind, stellaValue, cardValue)
			}));
		},

		async removeConflict(viewer, contactId, kind) {
			const removed = db
				.delete(nextcloudConflict)
				.where(
					and(
						eq(nextcloudConflict.householdId, viewer.householdId),
						eq(nextcloudConflict.contactId, contactId),
						eq(nextcloudConflict.kind, kind),
						inArray(nextcloudConflict.contactId, inBookIds(viewer))
					)
				)
				.returning({ contactId: nextcloudConflict.contactId })
				.all();
			return removed.length > 0;
		}
	};
}
