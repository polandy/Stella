import * as v from 'valibot';
import type { Viewer } from '$lib/server/access/visibility';
import { CIRCLE_COLORS, CIRCLE_KINDS, createCircle } from '$lib/server/domain/circles/circles';
import { CircleParentGoneError } from '$lib/server/domain/circles/nesting';
import { say, translator } from '$lib/server/i18n/say';

/*
 * The one way a new circle is made from a screen (docs/02 §2.4.2): the circles list's *New
 * circle* and the sub-circles card's *New sub-circle* post the same fields — name, kind, colour,
 * description, and *Belongs to* (a circle's id, empty for none). Each action wraps the refusal
 * under its own key, so the card's never lands in the circle page's member section.
 */

const CreateSchema = v.object({
	name: v.pipe(v.string(), v.trim(), v.minLength(1)),
	kind: v.optional(v.picklist(CIRCLE_KINDS)),
	color: v.optional(v.picklist(CIRCLE_COLORS)),
	description: v.optional(v.pipe(v.string(), v.trim())),
	parent: v.optional(v.string())
});

/** What creating answered: the new circle's id, or the refusal in the reader's language. */
export type CreatedCircle = { id: string } | { error: string };

/** Create the circle `form` describes, as `viewer`, shared with the household. */
export async function createCircleFromForm(
	locals: App.Locals,
	viewer: Viewer,
	form: FormData
): Promise<CreatedCircle> {
	const parsed = v.safeParse(CreateSchema, {
		name: form.get('name'),
		kind: form.get('kind') || undefined,
		color: form.get('color') || undefined,
		description: form.get('description') || undefined,
		parent: form.get('parent') || undefined
	});
	if (!parsed.success) return { error: say(locals, 'errors.circle.needCircleName') };

	const { parent, ...details } = parsed.output;
	try {
		const id = await createCircle(
			locals.services.circles.circleDeps,
			{ userId: viewer.id, householdId: viewer.householdId, defaultVisibility: 'shared' },
			{ ...details, parentId: parent ?? null }
		);
		return { id };
	} catch (err) {
		if (err instanceof CircleParentGoneError) return { error: err.phrase(translator(locals)) };
		throw err;
	}
}
