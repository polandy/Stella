import { fail, redirect } from '@sveltejs/kit';
import { requireViewer } from '$lib/server/auth/guards';
import {
	CIRCLE_COLORS,
	CIRCLE_KINDS,
	suggestCircleColor
} from '$lib/server/domain/circles/circles';
import { listCircles } from '$lib/server/domain/circles/directory';
import { listCircleCovers } from '$lib/server/domain/circles/circle-photos';
import { readCircleTree } from '$lib/server/domain/circles/tree';
import { todayFor } from '$lib/dates/today';
import type { Actions, PageServerLoad } from './$types';
import { createCircleFromForm } from './create-circle-form';

/*
 * Circles overview (docs/02 §2.4.2, docs/05 §5.5): all visible circles with member counts and
 * cover photos, plus a create form whose colour palette pre-selects a still-unused Catppuccin accent.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const viewer = requireViewer(locals);

	const [circles, tree, covers] = await Promise.all([
		listCircles(locals.services.circles.circleDirectoryDeps, viewer),
		readCircleTree(locals.services.circles.circleTreeDeps, viewer),
		listCircleCovers(locals.services.circles.circlePhotoDeps, viewer)
	]);
	const usedColors = circles.map((c) => c.color);

	return {
		circles,
		// The nesting: top-level circles become cards, their sub-circles rows (docs/02 §2.4.2).
		tree,
		// Which sub-circles are over, on the server's clock so both renders agree.
		today: todayFor(locals.services.circles.circleDeps.clock),
		// Each circle's cover photo, by circle id; a card without one shows no strip.
		covers,
		colors: CIRCLE_COLORS,
		kinds: CIRCLE_KINDS,
		suggestedColor: suggestCircleColor(usedColors)
	};
};

export const actions: Actions = {
	// *New circle*, standing for itself or inside the circle *Belongs to* names.
	create: async ({ request, locals }) => {
		const viewer = requireViewer(locals);
		const created = await createCircleFromForm(locals, viewer, await request.formData());
		if ('error' in created) return fail(400, { error: created.error });
		throw redirect(303, `/circles/${created.id}`);
	}
};
