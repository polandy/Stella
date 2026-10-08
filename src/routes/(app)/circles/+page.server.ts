import { fail, redirect } from '@sveltejs/kit';
import { requireViewer } from '$lib/server/auth/guards';
import * as v from 'valibot';
import {
	CIRCLE_COLORS,
	CIRCLE_KINDS,
	createCircle,
	suggestCircleColor
} from '$lib/server/domain/circles/circles';
import { listCircles } from '$lib/server/domain/circles/directory';
import { listCircleCovers } from '$lib/server/domain/circles/circle-photos';
import type { Actions, PageServerLoad } from './$types';
import { say } from '$lib/server/i18n/say';

/*
 * Circles overview (docs/02 §2.4.2, docs/05 §5.5): all visible circles with member counts and
 * cover photos, plus a create form whose colour palette pre-selects a still-unused Catppuccin accent.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const viewer = requireViewer(locals);

	const [circles, covers] = await Promise.all([
		listCircles(locals.services.circles.circleDirectoryDeps, viewer),
		listCircleCovers(locals.services.circles.circlePhotoDeps, viewer)
	]);
	const usedColors = circles.map((c) => c.color);

	return {
		circles,
		// Each circle's cover photo, by circle id; a card without one shows no strip.
		covers,
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
		const viewer = requireViewer(locals);

		const form = await request.formData();
		const parsed = v.safeParse(CreateSchema, {
			name: form.get('name'),
			kind: form.get('kind') || undefined,
			color: form.get('color') || undefined,
			description: form.get('description') || undefined
		});
		if (!parsed.success) return fail(400, { error: say(locals, 'errors.circle.needCircleName') });

		const id = await createCircle(
			locals.services.circles.circleDeps,
			{ userId: viewer.id, householdId: viewer.householdId, defaultVisibility: 'shared' },
			parsed.output
		);
		throw redirect(303, `/circles/${id}`);
	}
};
