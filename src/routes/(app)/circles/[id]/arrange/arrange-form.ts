import * as v from 'valibot';
import { ARRANGE_MODES } from '$lib/circles/arrange';

/*
 * The arrange screen's two posts, read at the edge (docs/02 §2.4.2, ADR-127). The page sends
 * JSON in one field; the bounds keep a hand-made post from asking for a huge batch. The domain
 * checks every circle and person again, so this only says what shape a post has.
 */

/** The most people one drop or one receipt may name. */
export const MAX_ARRANGE_ITEMS = 500;
const MAX_ID_LENGTH = 100;
const MAX_TEXT_LENGTH = 1000;

const Id = v.pipe(v.string(), v.minLength(1), v.maxLength(MAX_ID_LENGTH));
const OptionalText = v.nullable(v.pipe(v.string(), v.maxLength(MAX_TEXT_LENGTH)));
const Items = <T extends v.GenericSchema>(item: T) =>
	v.pipe(v.array(item), v.maxLength(MAX_ARRANGE_ITEMS));

const ArrangeSchema = v.object({
	mode: v.picklist(ARRANGE_MODES),
	target: Id,
	picks: v.pipe(Items(v.object({ circleId: Id, contactId: Id })), v.minLength(1))
});

const ChangeSchema = v.object({
	added: Items(
		v.object({
			id: Id,
			circleId: Id,
			contactId: Id,
			role: OptionalText,
			updatedAt: v.number()
		})
	),
	removed: Items(
		v.object({
			id: Id,
			circleId: Id,
			contactId: Id,
			role: OptionalText,
			startDate: OptionalText,
			endDate: OptionalText,
			note: OptionalText,
			createdBy: Id,
			createdAt: v.number(),
			updatedAt: v.number()
		})
	)
});

function parseJson(text: FormDataEntryValue | null): unknown {
	if (typeof text !== 'string') return undefined;
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

/** The post of a drop, or null when it is not what the page sends. */
export function readArrangeForm(form: FormData) {
	const parsed = v.safeParse(ArrangeSchema, {
		mode: form.get('mode'),
		target: form.get('target'),
		picks: parseJson(form.get('picks'))
	});
	return parsed.success ? parsed.output : null;
}

/** The receipt posted back by *Undo*, or null when it is not what the page was handed. */
export function readUndoForm(form: FormData) {
	const parsed = v.safeParse(ChangeSchema, parseJson(form.get('change')));
	return parsed.success ? parsed.output : null;
}
