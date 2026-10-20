import { error, fail } from '@sveltejs/kit';
import { circleTree } from '$lib/circles/tree';
import { requireViewer } from '$lib/server/auth/guards';
import {
	ArrangeNothingToDoError,
	ArrangeScopeError,
	ArrangeStaleError,
	arrangePeople,
	readArrangement,
	undoArrangement
} from '$lib/server/domain/circles/arrange-people';
import { readCircleTree } from '$lib/server/domain/circles/tree';
import { say, translator } from '$lib/server/i18n/say';
import type { Actions, PageServerLoad } from './$types';
import { readArrangeForm, readUndoForm } from './arrange-form';

/*
 * Arrange people (docs/02 §2.4.2, ADR-127): the circle and every sub-circle below it as cards of
 * the people directly in them, and the two posts of the screen — a batch move or copy, and the
 * Undo of one. The answer of a batch carries the receipt, which Undo posts back and the domain
 * checks again.
 */

export const load: PageServerLoad = async ({ locals, params }) => {
	const viewer = requireViewer(locals);
	const deps = locals.services.circles.arrangePeopleDeps;
	const zones = await readArrangement(deps, viewer, params.id);
	if (!zones) throw error(404, say(locals, 'errors.circle.notFound'));
	const tree = circleTree(await readCircleTree(locals.services.circles.circleTreeDeps, viewer));
	return {
		circle: { id: params.id, name: zones[0].name },
		nesting: { ancestors: tree.ancestors(params.id) },
		zones
	};
};

/** The refusals the screen can explain; anything else is a crash. */
function isRefusal(
	err: unknown
): err is ArrangeScopeError | ArrangeStaleError | ArrangeNothingToDoError {
	return (
		err instanceof ArrangeScopeError ||
		err instanceof ArrangeStaleError ||
		err instanceof ArrangeNothingToDoError
	);
}

export const actions = {
	arrange: async ({ request, locals, params }) => {
		const viewer = requireViewer(locals);
		const post = readArrangeForm(await request.formData());
		if (!post) return fail(400, { arrangeError: say(locals, 'errors.form.checkAndRetry') });

		try {
			const arranged = await arrangePeople(locals.services.circles.arrangePeopleDeps, viewer, {
				scopeCircleId: params.id,
				mode: post.mode,
				targetId: post.target,
				picks: post.picks
			});
			return { arranged };
		} catch (err) {
			if (isRefusal(err)) return fail(400, { arrangeError: err.phrase(translator(locals)) });
			throw err;
		}
	},

	undo: async ({ request, locals, params }) => {
		const viewer = requireViewer(locals);
		const change = readUndoForm(await request.formData());
		if (!change) return fail(400, { arrangeError: say(locals, 'errors.form.checkAndRetry') });

		try {
			const undone = await undoArrangement(
				locals.services.circles.arrangePeopleDeps,
				viewer,
				params.id,
				change
			);
			return { undone };
		} catch (err) {
			if (isRefusal(err)) return fail(400, { arrangeError: err.phrase(translator(locals)) });
			throw err;
		}
	}
} satisfies Actions;
