import { error, fail, redirect } from '@sveltejs/kit';
import { requireViewer } from '$lib/server/auth/guards';
import { CircleGoneError } from '$lib/server/domain/circles/circle-details';
import {
	CircleLoopError,
	CircleParentGoneError,
	moveCircle
} from '$lib/server/domain/circles/nesting';
import { say, translator } from '$lib/server/i18n/say';
import type { Actions } from '../$types';
import { createCircleFromForm } from '../../create-circle-form';

/*
 * Moving a circle without its edit form (docs/02 §2.4.2): the sub-circles card's *Add existing*
 * and *Detach*, and every *Undo* of a move — the edit form's included. No confirmation: the page
 * stays, and the answer carries the move so the toast's *Undo* posts back exactly where it was
 * (ADR-126). The circle moved need not be the page's own: *Detach* moves one of its children.
 * *New sub-circle* makes one as the list's *New circle* does, and opens it.
 */
export const nestingActions = {
	moveCircle: async ({ request, locals }) => {
		const viewer = requireViewer(locals);
		const form = await request.formData();
		const circleId = form.get('circle');
		const parent = form.get('parent');
		// The page always posts both; a form without them was not made by it.
		if (typeof circleId !== 'string' || !circleId || typeof parent !== 'string') {
			return fail(400, { moveError: say(locals, 'errors.form.checkAndRetry') });
		}

		try {
			const move = await moveCircle(
				locals.services.circles.circleNestingDeps,
				viewer,
				circleId,
				parent || null
			);
			return { move };
		} catch (err) {
			if (err instanceof CircleLoopError || err instanceof CircleParentGoneError) {
				return fail(400, { moveError: err.phrase(translator(locals)) });
			}
			if (err instanceof CircleGoneError) throw error(404, err.phrase(translator(locals)));
			throw err;
		}
	},

	createSubCircle: async ({ request, locals }) => {
		const viewer = requireViewer(locals);
		const created = await createCircleFromForm(locals, viewer, await request.formData());
		// Under its own key: the page's `error` belongs to the member section.
		if ('error' in created) return fail(400, { createError: created.error });
		throw redirect(303, `/circles/${created.id}`);
	}
} satisfies Actions;
