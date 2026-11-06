import type { RestoreContext } from './restore-context';
import { ids, ms, records, str, visibilityOf, type Row } from './restore-fields';
import type { PhotoPlan } from './restore-photos';

/*
 * What gathers people together in an archive (docs/02 §2.15): the tags on them, the circles
 * they belong to and the homes they share. Each only keeps the people the archive brought.
 */

/**
 * A tag is unique by name within a household, so one the household already has is reused and
 * the archive's id is re-pointed at it — otherwise every link would hit that constraint.
 */
export function planTags(
	document: Row,
	people: readonly Row[],
	knownPeople: ReadonlySet<string>,
	existing: readonly { id: string; name: string }[],
	ctx: RestoreContext
): { tags: Row[]; contactTags: Row[] } {
	const tags: Row[] = [];
	const tagIdByArchiveId = new Map<string, string>();
	const tagIdByName = new Map(existing.map((tag) => [tag.name, tag.id]));
	for (const tag of records(document, 'tags')) {
		const id = str(tag, 'id');
		const name = str(tag, 'name');
		if (id === null || name === null) {
			ctx.warn({ code: 'tagWithoutName' });
			continue;
		}
		const already = tagIdByName.get(name);
		if (already !== undefined) {
			tagIdByArchiveId.set(id, already);
			continue;
		}
		tagIdByArchiveId.set(id, id);
		tagIdByName.set(name, id);
		tags.push({
			id,
			household_id: ctx.householdId,
			name,
			color: str(tag, 'color') ?? 'lavender',
			...ctx.stamps(tag)
		});
	}

	const contactTags: Row[] = [];
	for (const person of people) {
		const contactId = str(person, 'id');
		if (contactId === null || !knownPeople.has(contactId)) continue;
		for (const archiveTagId of ids(person, 'tags')) {
			const tagId = tagIdByArchiveId.get(archiveTagId);
			if (tagId === undefined) {
				ctx.warn({ code: 'tagsNotInList' });
				continue;
			}
			contactTags.push({ contact_id: contactId, tag_id: tagId });
		}
	}
	return { tags, contactTags };
}

export function planCircles(
	document: Row,
	knownPeople: ReadonlySet<string>,
	photos: PhotoPlan,
	ctx: RestoreContext
): { circles: Row[]; memberships: Row[] } {
	const { author, stamps, warn } = ctx;
	const circles: Row[] = [];
	const memberships: Row[] = [];
	const circleRows = records(document, 'circles');
	const knownCircles = new Set(
		circleRows.map((circle) => str(circle, 'id')).filter((id): id is string => id !== null)
	);
	for (const circle of circleRows) {
		const id = str(circle, 'id');
		const name = str(circle, 'name');
		if (id === null || name === null) {
			warn({ code: 'circleWithoutName' });
			continue;
		}
		const parent = str(circle, 'parent');
		if (parent !== null && !knownCircles.has(parent)) {
			warn({ code: 'circleMissingParent', name });
		}
		circles.push({
			id,
			household_id: ctx.householdId,
			created_by: author(circle),
			visibility: visibilityOf(circle),
			name,
			description: str(circle, 'description'),
			kind: str(circle, 'kind') ?? 'other',
			color: str(circle, 'color') ?? 'blue',
			parent_circle_id: parent !== null && knownCircles.has(parent) ? parent : null,
			start_date: str(circle, 'start'),
			end_date: str(circle, 'end'),
			archived_at: ms(circle, 'archived_at'),
			...stamps(circle)
		});

		// Only a circle that is restored brings its photos: a refused circle refuses them too.
		for (const image of records(circle, 'photos')) photos.add(image, { circleId: id });

		for (const member of records(circle, 'members')) {
			const person = str(member, 'person');
			if (person === null || !knownPeople.has(person)) {
				warn({ code: 'circleMemberMissing', name });
				continue;
			}
			memberships.push({
				id: str(member, 'id') ?? ctx.ids.next(),
				circle_id: id,
				contact_id: person,
				role: str(member, 'role'),
				start_date: str(member, 'since'),
				end_date: str(member, 'until'),
				note: str(member, 'note'),
				created_by: author(member),
				...stamps(member)
			});
		}
	}
	return { circles, memberships };
}

/**
 * A home is only ever reached through who lives there (docs/03 §3.3): one with nobody of this
 * archive in it would be an address nobody could see or remove, so it is left out.
 */
export function planHomes(
	document: Row,
	knownPeople: ReadonlySet<string>,
	ctx: RestoreContext
): { homes: Row[]; homeMembers: Row[] } {
	const { author, warn } = ctx;
	const homes: Row[] = [];
	const homeMembers: Row[] = [];
	for (const home of records(document, 'homes')) {
		const id = str(home, 'id');
		const value = str(home, 'value');
		const livesThere = ids(home, 'members');
		const known = livesThere.filter((person) => knownPeople.has(person));
		if (known.length < livesThere.length) warn({ code: 'homeMembersMissing' });
		if (id === null || value === null || known.length === 0) {
			warn({ code: 'homeIncomplete' });
			continue;
		}
		homes.push({
			id,
			household_id: ctx.householdId,
			label: str(home, 'label'),
			value,
			meta: str(home, 'meta'),
			created_by: author(home),
			...ctx.stamps(home)
		});
		for (const person of new Set(known)) {
			homeMembers.push({
				home_id: id,
				contact_id: person,
				created_by: author(home),
				created_at: ms(home, 'created_at') ?? ctx.now
			});
		}
	}
	return { homes, homeMembers };
}
