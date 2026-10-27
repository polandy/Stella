import { fail, type RequestEvent } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth/guards';
import { nextcloudWording } from '$lib/server/i18n/import-wording';
import { say } from '$lib/server/i18n/say';
import { reviewStep } from './review';
import { bookStep } from './staged';

/*
 * The linked Nextcloud book on the import page (docs/02 §2.16.3): when it last synced, *Sync
 * now*, and its new cards in the matching review. Without a linked book none of it exists, and
 * an action posted anyway is refused as not found.
 */

const viewerOf = (locals: App.Locals) => {
	const user = requireAdmin(locals);
	return { id: user.id, householdId: user.householdId };
};

/** What the panel shows; null when this instance has no linked book. */
export async function nextcloudPanel(locals: App.Locals) {
	const nextcloud = locals.services.nextcloud;
	return nextcloud ? nextcloud.link.status(viewerOf(locals)) : null;
}

// The panel's own key, so the upload form above it does not say it too.
const notLinked = (locals: App.Locals) =>
	fail(404, { step: 'upload' as const, nextcloudError: say(locals, 'nextcloud.error.notLinked') });

export const nextcloudActions = {
	nextcloudSync: async ({ locals }: RequestEvent) => {
		const viewer = viewerOf(locals);
		const nextcloud = locals.services.nextcloud;
		if (!nextcloud) return notLinked(locals);
		const result = await nextcloud.link.sync(viewer.householdId, {
			wording: nextcloudWording(locals),
			locale: locals.locale
		});
		if (!result.ok) {
			const nextcloudError = say(locals, 'nextcloud.error.unreachable');
			return fail(502, { step: 'upload' as const, nextcloudError });
		}
		return { step: 'upload' as const, synced: result.outcome };
	},

	nextcloudReview: async ({ locals }: RequestEvent) => {
		viewerOf(locals);
		const step = await bookStep(locals);
		return step ? reviewStep(locals, step) : notLinked(locals);
	}
};
