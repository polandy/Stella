import { error, fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { requireViewer } from '$lib/server/auth/guards';
import {
	BlankCircleNameError,
	CircleGoneError,
	CirclePeriodBackwardsError
} from '$lib/server/domain/circles/circle-details';
import { CircleLoopError, CircleParentGoneError } from '$lib/server/domain/circles/nesting';
import { updateCircle } from '$lib/server/domain/circles/update-circle';
import { say, translator } from '$lib/server/i18n/say';
import type { Actions } from '../$types';

/*
 * Editing a circle's details from its header (docs/02 §2.4.2): name, kind, colour, description,
 * period and the circle it belongs to, for anyone who sees the circle. The use-case validates;
 * this only reads the form and says a refusal under it — a parent's under *Belongs to*.
 */

const optionalText = v.optional(v.string());
/** What the header's form posts; the checks themselves are `readCircleDetails`'s. */
const DetailsForm = v.object({
	name: v.string(),
	kind: optionalText,
	color: optionalText,
	description: optionalText,
	startDate: optionalText,
	endDate: optionalText,
	// *Belongs to*: a circle's id, empty for none; a form without it leaves the parent alone.
	parent: optionalText
});

const field = (form: FormData, name: string) => form.get(name) ?? undefined;

export const detailsActions = {
	updateCircle: async ({ request, params, locals }) => {
		const viewer = requireViewer(locals);
		const form = await request.formData();
		const parsed = v.safeParse(DetailsForm, {
			name: field(form, 'name'),
			kind: field(form, 'kind'),
			color: field(form, 'color'),
			description: field(form, 'description'),
			startDate: field(form, 'startDate'),
			endDate: field(form, 'endDate'),
			parent: field(form, 'parent')
		});
		// The page always posts a name; a form without one was not made by it.
		if (!parsed.success) {
			return fail(400, { detailsError: say(locals, 'errors.form.checkAndRetry') });
		}

		try {
			const { parent, ...details } = parsed.output;
			await updateCircle(locals.services.circles.updateCircleDeps, viewer, params.id, {
				...details,
				parentId: parent === undefined ? undefined : parent || null
			});
		} catch (err) {
			if (err instanceof CircleLoopError || err instanceof CircleParentGoneError) {
				return fail(400, { parentError: err.phrase(translator(locals)) });
			}
			if (err instanceof BlankCircleNameError || err instanceof CirclePeriodBackwardsError) {
				return fail(400, { detailsError: err.phrase(translator(locals)) });
			}
			if (err instanceof CircleGoneError) throw error(404, err.phrase(translator(locals)));
			throw err;
		}
		throw redirect(303, `/circles/${params.id}`);
	}
} satisfies Actions;
