import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { contactVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type { InteractionRow, MomentRow, StreamPerson } from '../domain/stream/stream';
import type * as schema from './schema';
import {
	contact,
	interaction,
	interactionParticipant,
	journalEntry,
	journalMention,
	journalSubject,
	photo,
	user
} from './schema';

/*
 * A moment and a touchpoint as a list of them reads one — the household stream
 * (docs/02 §2.22.2) and *On this day* (§2.12.1) alike: the columns to select, joined with the
 * author and the person, and what comes after the scoped read — the mention chips, the photos,
 * the further people a moment is about, the participants. Those last are limited to people the
 * viewer may see, so they never widen the read they hang off.
 */

/** A moment's columns; the read joins `contact` on the entry's person and `user` on its author. */
export const momentColumns = {
	id: journalEntry.id,
	// The last change, not creation: a moment appended to the day's entry (§2.22.1) has to
	// surface where its author expects it, at the top.
	at: journalEntry.updatedAt,
	actorId: user.id,
	actorName: user.name,
	anchorId: contact.id,
	anchorName: contact.displayName,
	anchorAvatar: contact.avatarPhotoId,
	entryDate: journalEntry.entryDate,
	visibility: journalEntry.visibility,
	body: journalEntry.body
};

/** A touchpoint's columns; the read joins `contact` on its subject and `user` on its author. */
export const touchpointColumns = {
	id: interaction.id,
	at: interaction.createdAt,
	actorId: user.id,
	actorName: user.name,
	subjectId: contact.id,
	subjectName: contact.displayName,
	subjectAvatar: contact.avatarPhotoId,
	interactionKind: interaction.kind,
	happenedAt: interaction.happenedAt,
	title: interaction.title,
	visibility: interaction.visibility
};

type Db = BunSQLiteDatabase<typeof schema>;
/** What a select of `columns` returns: each column's value, `null` where the column allows it. */
type Selected<C extends Record<string, { _: { data: unknown; notNull: boolean } }>> = {
	[K in keyof C]: C[K]['_']['notNull'] extends true ? C[K]['_']['data'] : C[K]['_']['data'] | null;
};
type MomentSelection = Selected<typeof momentColumns>;
type TouchpointSelection = Selected<typeof touchpointColumns>;

function grouped<T>(rows: readonly T[], keyOf: (row: T) => string | null) {
	const groups = new Map<string, T[]>();
	for (const row of rows) {
		const key = keyOf(row);
		if (key === null) continue;
		groups.set(key, [...(groups.get(key) ?? []), row]);
	}
	return groups;
}

const personOf = (p: StreamPerson): StreamPerson => ({
	id: p.id,
	name: p.name,
	avatarPhotoId: p.avatarPhotoId
});

/** The scoped moment rows with the further people, mentions and photos the viewer may see. */
export function momentRowsOf(db: Db, viewer: Viewer, rows: MomentSelection[]): MomentRow[] {
	if (rows.length === 0) return [];
	const ids = rows.map((r) => r.id);
	const mentions = grouped(
		db
			.select({
				entryId: journalMention.journalEntryId,
				id: contact.id,
				name: contact.displayName,
				avatarPhotoId: contact.avatarPhotoId
			})
			.from(journalMention)
			.innerJoin(contact, eq(journalMention.contactId, contact.id))
			.where(and(inArray(journalMention.journalEntryId, ids), contactVisibleTo(viewer)))
			.all(),
		(m) => m.entryId
	);
	const others = grouped(
		db
			.select({
				entryId: journalSubject.journalEntryId,
				id: contact.id,
				name: contact.displayName,
				avatarPhotoId: contact.avatarPhotoId
			})
			.from(journalSubject)
			.innerJoin(contact, eq(journalSubject.contactId, contact.id))
			.where(and(inArray(journalSubject.journalEntryId, ids), contactVisibleTo(viewer)))
			.orderBy(asc(sql`${journalSubject}.rowid`))
			.all(),
		(o) => o.entryId
	);
	const photos = grouped(
		db
			.select({ entryId: photo.journalEntryId, id: photo.id })
			.from(photo)
			.where(inArray(photo.journalEntryId, ids))
			.orderBy(photo.createdAt)
			.all(),
		(p) => p.entryId
	);
	return rows.map((r) => ({
		id: r.id,
		at: r.at,
		actor: { id: r.actorId, name: r.actorName },
		anchor: { id: r.anchorId, name: r.anchorName, avatarPhotoId: r.anchorAvatar },
		others: (others.get(r.id) ?? []).map(personOf),
		entryDate: r.entryDate,
		visibility: r.visibility,
		body: r.body,
		mentions: (mentions.get(r.id) ?? []).map(personOf),
		photoIds: (photos.get(r.id) ?? []).map((p) => p.id)
	}));
}

/** The scoped touchpoint rows, with the participants the viewer may see, by name. */
export function touchpointRowsOf(
	db: Db,
	viewer: Viewer,
	rows: TouchpointSelection[]
): InteractionRow[] {
	if (rows.length === 0) return [];
	const participants = grouped(
		db
			.select({
				interactionId: interactionParticipant.interactionId,
				id: contact.id,
				name: contact.displayName,
				avatarPhotoId: contact.avatarPhotoId
			})
			.from(interactionParticipant)
			.innerJoin(contact, eq(interactionParticipant.contactId, contact.id))
			.where(
				and(
					inArray(
						interactionParticipant.interactionId,
						rows.map((r) => r.id)
					),
					contactVisibleTo(viewer)
				)
			)
			.orderBy(contact.displayName)
			.all(),
		(p) => p.interactionId
	);
	return rows.map((r) => ({
		id: r.id,
		at: r.at,
		actor: { id: r.actorId, name: r.actorName },
		subject: { id: r.subjectId, name: r.subjectName, avatarPhotoId: r.subjectAvatar },
		interactionKind: r.interactionKind,
		happenedAt: r.happenedAt,
		title: r.title,
		visibility: r.visibility,
		participants: (participants.get(r.id) ?? []).map(personOf)
	}));
}
