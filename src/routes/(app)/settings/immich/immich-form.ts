import * as v from 'valibot';
import type { ConfirmedMatch } from '$lib/server/domain/immich/links';
import type { NewcomerName } from '$lib/server/domain/immich/add-from-immich';

/*
 * What the forms of *Find your people* post (docs/02 §2.24.7), read as plain data so it is
 * tested without a request (docs/08 §8.5). Each reader answers null for a post that is not from
 * the page; `+page.server.ts` refuses it.
 */

/** More pairs than any list shows at once; a post with more is not from this page. */
export const MAX_PAIRS = 2000;

/** The pairs a form posts: `contactId` and `immichPersonId`, repeated in step. */
export function pairsOf(form: FormData): ConfirmedMatch[] | null {
	const contactIds = form.getAll('contactId');
	const personIds = form.getAll('immichPersonId');
	if (
		contactIds.length === 0 ||
		contactIds.length !== personIds.length ||
		contactIds.length > MAX_PAIRS
	)
		return null;
	const pairs: ConfirmedMatch[] = [];
	for (const [at, contactId] of contactIds.entries()) {
		const immichPersonId = personIds[at];
		if (typeof contactId !== 'string' || typeof immichPersonId !== 'string') return null;
		pairs.push({ contactId, immichPersonId });
	}
	return pairs;
}

/** One contact and the faces of its row, as the Ignore and Propose again forms post them. */
export function rowOf(form: FormData): { contactId: string; personIds: string[] } | null {
	const contactId = form.get('contactId');
	const personIds = form.getAll('immichPersonId');
	if (typeof contactId !== 'string' || !personIds.every((id) => typeof id === 'string'))
		return null;
	return { contactId, personIds: personIds as string[] };
}

/** The Immich person a newcomer form is about, or null when it posted none. */
export function newcomerOf(form: FormData): string | null {
	const personId = form.get('immichPersonId');
	return typeof personId === 'string' && personId !== '' ? personId : null;
}

const optionalText = v.optional(v.pipe(v.string(), v.trim()), '');

/** What *Add and link* posts: the face, and the name the member settled on. */
const AddNewcomerSchema = v.object({
	immichPersonId: v.pipe(v.string(), v.minLength(1)),
	firstName: optionalText,
	lastName: optionalText,
	nickname: optionalText,
	description: optionalText,
	usePhoto: v.optional(v.string())
});

/** *Add and link*'s face, name and whether the face becomes the photo; null when it does not read. */
export function newcomerToAdd(
	form: FormData
): { immichPersonId: string; name: NewcomerName; usePhoto: boolean } | null {
	const parsed = v.safeParse(AddNewcomerSchema, Object.fromEntries(form));
	if (!parsed.success) return null;
	const { immichPersonId, usePhoto, ...name } = parsed.output;
	return { immichPersonId, name, usePhoto: Boolean(usePhoto) };
}
