import { error, json } from '@sveltejs/kit';
import type { CircleDeletionCounts } from '$lib/circles/deletion';
import { requireRemover } from '$lib/server/auth/guards';
import { CircleGoneError } from '$lib/server/domain/circles/circle-details';
import { circleDeletionPreview } from '$lib/server/domain/circles/delete-circle';
import { translator } from '$lib/server/i18n/say';
import type { RequestHandler } from './$types';

/*
 * What deleting a circle would take (docs/02 §2.4.2), for its confirm step. The step asks for it
 * only when it opens, so the circle page's `load` does not count photos for a step most visits
 * never open. A circle the viewer may not delete, cannot see, or that is gone answers 404.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	const remover = requireRemover(locals);
	try {
		const preview = await circleDeletionPreview(
			locals.services.circles.circleDeletionDeps,
			remover,
			params.id
		);
		// The shape the confirm step reads (`circleDeletionSentences`), held to it by the compiler.
		return json(preview satisfies CircleDeletionCounts);
	} catch (err) {
		if (err instanceof CircleGoneError) throw error(404, err.phrase(translator(locals)));
		throw err;
	}
};
