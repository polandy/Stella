import { error, fail } from '@sveltejs/kit';
import * as v from 'valibot';
import { requireViewer } from '$lib/server/auth/guards';
import { answerConflict, conflictsToShow } from '$lib/server/domain/nextcloud/conflicts';
import { nextcloudWording } from '$lib/server/i18n/import-wording';
import { say } from '$lib/server/i18n/say';
import type { Actions, PageServerLoad } from './$types';

/*
 * The differences a sync of the linked Nextcloud book found (docs/02 §2.16.3), under Data
 * quality: until a member answers one, Stella keeps its side and the person's card is left as it
 * is. Without a linked book the page does not exist.
 */

function nextcloudOf(locals: App.Locals) {
	const nextcloud = locals.services.nextcloud;
	if (!nextcloud) throw error(404, say(locals, 'nextcloud.error.notLinked'));
	return nextcloud;
}

export const load: PageServerLoad = async ({ locals }) => {
	const viewer = requireViewer(locals);
	const nextcloud = nextcloudOf(locals);
	return { conflicts: await conflictsToShow(nextcloud.conflictAnswerDeps, viewer) };
};

const AnswerSchema = v.object({
	contactId: v.pipe(v.string(), v.minLength(1)),
	kind: v.picklist(['firstName', 'lastName', 'birthday', 'photo']),
	take: v.picklist(['stella', 'card'])
});

export const actions: Actions = {
	answer: async ({ request, locals }) => {
		const viewer = requireViewer(locals);
		const nextcloud = nextcloudOf(locals);
		const parsed = v.safeParse(AnswerSchema, Object.fromEntries(await request.formData()));
		if (!parsed.success) return fail(400, { gone: say(locals, 'nextcloud.conflicts.gone') });

		const answered = await answerConflict(nextcloud.conflictAnswerDeps, {
			viewer,
			...parsed.output,
			wording: nextcloudWording(locals),
			locale: locals.locale
		});
		// Someone else may have answered it a moment before; the list reloads either way.
		if (!answered) return fail(409, { gone: say(locals, 'nextcloud.conflicts.gone') });
		return { answered: parsed.output.contactId };
	}
};
