import { and, asc, eq, inArray, type SQL } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { NextcloudSource } from '../../import-match/card';
import { contactInBookFor } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type { LinkedPerson } from '../domain/nextcloud/store';
import type * as schema from './schema';
import {
	contact,
	contactField,
	contactSourceLink,
	contactTag,
	home,
	homeMember,
	photo,
	tag
} from './schema';

/*
 * The people linked to a card of the Nextcloud book, with what the sync reads and writes of them
 * (docs/02 §2.16.3): only those `viewer` may browse, and their avatar only when it is shared.
 */

type Db = BunSQLiteDatabase<typeof schema>;

/** Rows of one person each, gathered per person in row order. */
function grouped<T>(rows: readonly { contactId: string; item: T }[]): Map<string, T[]> {
	const byId = new Map<string, T[]>();
	for (const { contactId, item } of rows)
		byId.set(contactId, [...(byId.get(contactId) ?? []), item]);
	return byId;
}

/** By card key. */
export function readLinkedPeople(
	db: Db,
	viewer: Viewer,
	source: NextcloudSource
): Map<string, LinkedPerson> {
	const browsable: SQL = and(
		eq(contactSourceLink.householdId, viewer.householdId),
		eq(contactSourceLink.source, source),
		eq(contactSourceLink.state, 'linked'),
		contactInBookFor(viewer)
	)!;
	const people = db
		.select({
			uid: contactSourceLink.externalUid,
			id: contact.id,
			firstName: contact.firstName,
			lastName: contact.lastName,
			displayName: contact.displayName,
			nickname: contact.nickname,
			company: contact.company,
			jobTitle: contact.jobTitle,
			birthDate: contact.birthDate,
			birthDatePrecision: contact.birthDatePrecision,
			avatarPhotoId: contact.avatarPhotoId,
			photoId: photo.id,
			photoPath: photo.filePath,
			photoMime: photo.mime
		})
		.from(contactSourceLink)
		.innerJoin(contact, eq(contact.id, contactSourceLink.contactId))
		.leftJoin(photo, and(eq(photo.id, contact.avatarPhotoId), eq(photo.visibility, 'shared')))
		.where(browsable)
		.all();
	const ids = people.map((p) => p.id);
	if (ids.length === 0) return new Map();
	const fields = grouped(
		db
			.select({
				contactId: contactField.contactId,
				item: { kind: contactField.kind, value: contactField.value, label: contactField.label }
			})
			.from(contactField)
			.where(inArray(contactField.contactId, ids))
			.orderBy(asc(contactField.sortOrder), asc(contactField.id))
			.all()
	);
	const homeLines = grouped(
		db
			.select({ contactId: homeMember.contactId, item: home.value })
			.from(homeMember)
			.innerJoin(home, eq(home.id, homeMember.homeId))
			.where(inArray(homeMember.contactId, ids))
			.all()
	);
	const tags = grouped(
		db
			.select({ contactId: contactTag.contactId, item: tag.name })
			.from(contactTag)
			.innerJoin(tag, eq(tag.id, contactTag.tagId))
			.where(inArray(contactTag.contactId, ids))
			.orderBy(asc(tag.name))
			.all()
	);
	return new Map(
		people.map(
			({
				uid,
				birthDate,
				birthDatePrecision,
				avatarPhotoId,
				photoId,
				photoPath,
				photoMime,
				...person
			}): [string, LinkedPerson] => [
				uid,
				{
					...person,
					birthday: birthDate === null ? null : { value: birthDate, precision: birthDatePrecision },
					fields: fields.get(person.id) ?? [],
					homeLines: homeLines.get(person.id) ?? [],
					tags: tags.get(person.id) ?? [],
					hasPhoto: avatarPhotoId !== null,
					avatar:
						photoId && photoPath && photoMime ? { photoId, path: photoPath, mime: photoMime } : null
				}
			]
		)
	);
}
