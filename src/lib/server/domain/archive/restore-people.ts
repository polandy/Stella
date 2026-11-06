import { isImmichId } from '../immich/gateway';
import type { RestoreContext } from './restore-context';
import { bool, ms, record, records, str, visibilityOf, type Row } from './restore-fields';

/*
 * The people an archive brings (docs/02 §2.15), and which Immich person each of them is or was
 * said not to be (docs/02 §2.24.5). Everything else hangs off the ids collected here: a record
 * pointing at a person outside `knownPeople` is a person this archive did not bring along.
 */

export interface PeopleRows {
	contacts: Row[];
	immichLinks: Row[];
	/** The ids restored, which every later planner checks its pointers against. */
	knownPeople: ReadonlySet<string>;
}

export function planPeople(people: readonly Row[], ctx: RestoreContext): PeopleRows {
	const { author, warn } = ctx;
	const contacts: Row[] = [];
	const knownPeople = new Set<string>();
	for (const person of people) {
		const id = str(person, 'id');
		const displayName = str(person, 'display_name');
		if (id === null || displayName === null) {
			warn({ code: 'personWithoutName' });
			continue;
		}
		knownPeople.add(id);
		contacts.push({
			id,
			household_id: ctx.householdId,
			created_by: author(person),
			visibility: visibilityOf(person),
			first_name: str(person, 'first_name'),
			last_name: str(person, 'last_name'),
			nickname: str(person, 'nickname'),
			prefix: str(person, 'prefix'),
			suffix: str(person, 'suffix'),
			former_name: str(person, 'former_name'),
			display_name: displayName,
			gender: str(person, 'gender'),
			pronouns: str(person, 'pronouns'),
			description: str(person, 'description'),
			avatar_photo_id: str(person, 'avatar'),
			birth_date: str(person, 'birth_date'),
			birth_date_precision: str(person, 'birth_date_precision') ?? 'full',
			is_deceased: bool(person, 'deceased') ? 1 : 0,
			death_date: str(person, 'death_date'),
			job_title: str(person, 'job_title'),
			company: str(person, 'company'),
			how_we_met: str(person, 'how_we_met'),
			met_date: str(person, 'met_date'),
			met_place: str(person, 'met_place'),
			without_last_name_at: ms(person, 'without_last_name_at'),
			archived_at: ms(person, 'archived_at'),
			...ctx.stamps(person)
		});
	}

	// Which Immich person each of them is. The id travels into Immich's URL paths, so one that
	// is not an Immich id is refused rather than restored.
	const immichLinks: Row[] = [];
	for (const person of people) {
		const contactId = str(person, 'id');
		const link = record(person.immich);
		if (contactId === null || !knownPeople.has(contactId) || link === null) continue;
		const immichPersonId = str(link, 'person');
		if (!isImmichId(immichPersonId)) {
			warn({ code: 'immichLinkIncomplete' });
			continue;
		}
		immichLinks.push({
			contact_id: contactId,
			immich_person_id: immichPersonId,
			linked_by: author(link, 'linked_by'),
			linked_at: ms(link, 'linked_at') ?? ctx.now
		});
	}

	return { contacts, immichLinks, knownPeople };
}

/** The Immich faces each person was said not to be, refused on the same terms as a link. */
export function planImmichIgnores(
	people: readonly Row[],
	knownPeople: ReadonlySet<string>,
	ctx: RestoreContext
): Row[] {
	const immichIgnores: Row[] = [];
	for (const person of people) {
		const contactId = str(person, 'id');
		if (contactId === null || !knownPeople.has(contactId)) continue;
		for (const ignored of records(person, 'immich_ignored')) {
			const immichPersonId = str(ignored, 'person');
			if (!isImmichId(immichPersonId)) {
				ctx.warn({ code: 'immichIgnoreIncomplete' });
				continue;
			}
			immichIgnores.push({
				contact_id: contactId,
				immich_person_id: immichPersonId,
				ignored_by: ctx.author(ignored, 'ignored_by'),
				ignored_at: ms(ignored, 'ignored_at') ?? ctx.now
			});
		}
	}
	return immichIgnores;
}
