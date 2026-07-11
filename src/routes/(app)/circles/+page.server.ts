import { fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import {
	CIRCLE_COLORS,
	CIRCLE_KINDS,
	createCircle,
	listCircles,
	suggestCircleColor
} from '$lib/server/domain/circles/circles';
import { getCircleDeps } from '$lib/server/services';
import type { Actions, PageServerLoad } from './$types';

/*
 * Circles overview (docs/02 §2.4.2, docs/05 §5.5): all visible circles with member counts,
 * plus a create form whose colour palette pre-selects a still-unused Catppuccin accent.
 */
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/login');
	const viewer = { id: locals.user.id, householdId: locals.user.householdId };

	const circles = await listCircles(getCircleDeps(), viewer);
	const usedColors = circles.map((c) => c.color);

	return {
		circles,
		colors: CIRCLE_COLORS,
		kinds: CIRCLE_KINDS,
		suggestedColor: suggestCircleColor(usedColors)
	};
};

const CreateSchema = v.object({
	name: v.pipe(v.string(), v.trim(), v.minLength(1)),
	kind: v.optional(v.picklist(CIRCLE_KINDS)),
	color: v.optional(v.picklist(CIRCLE_COLORS)),
	description: v.optional(v.pipe(v.string(), v.trim()))
});

export const actions: Actions = {
	create: async ({ request, locals }) => {
		if (!locals.user) throw redirect(302, '/login');

		const form = await request.formData();
		const parsed = v.safeParse(CreateSchema, {
			name: form.get('name'),
			kind: form.get('kind') || undefined,
			color: form.get('color') || undefined,
			description: form.get('description') || undefined
		});
		if (!parsed.success) return fail(400, { error: 'Please name the circle.' });

		const id = await createCircle(
			getCircleDeps(),
			{ userId: locals.user.id, householdId: locals.user.householdId, defaultVisibility: 'shared' },
			parsed.output
		);
		throw redirect(303, `/circles/${id}`);
	}
};
