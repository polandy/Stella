import { error, fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { requireViewer } from '$lib/server/auth/guards';
import {
	BlankCircleNameError,
	CircleGoneError,
	CirclePeriodBackwardsError
} from '$lib/server/domain/circles/circle-details';
import { updateCircle } from '$lib/server/domain/circles/update-circle';
import { say, translator } from '$lib/server/i18n/say';
import type { Actions } from '../$types';

/*
 * Editing a circle's details from its header (docs/02 §2.4.2): name, kind, colour, description
 * and period, for anyone who sees the circle. The use-case validates; this only reads the form
 * and says a refusal under it.
 */

const optionalText = v.optional(v.string());
/** What the header's form posts; the checks themselves are `readCircleDetails`'s. */
const DetailsForm = v.object({
	name: v.string(),
	kind: optionalText,
	color: optionalText,
	description: optionalText,
	startDate: optionalText,
	endDate: optionalText
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
			endDate: field(form, 'endDate')
		});
		// The page always posts a name; a form without one was not made by it.
		if (!parsed.success) {
			return fail(400, { detailsError: say(locals, 'errors.form.checkAndRetry') });
		}

		try {
			await updateCircle(locals.services.circles.circleDeps, viewer, params.id, parsed.output);
		} catch (err) {
			if (err instanceof BlankCircleNameError || err instanceof CirclePeriodBackwardsError) {
				return fail(400, { detailsError: err.phrase(translator(locals)) });
			}
			if (err instanceof CircleGoneError) throw error(404, err.phrase(translator(locals)));
			throw err;
		}
		throw redirect(303, `/circles/${params.id}`);
	}
} satisfies Actions;
