import { fail, type RequestEvent } from '@sveltejs/kit';
import * as v from 'valibot';
import type { NextcloudSource } from '$lib/import-match/card';
import { requireAdmin } from '$lib/server/auth/guards';
import {
	applyContactReview,
	ReviewUnansweredError
} from '$lib/server/domain/import/contact-review';
import { ContactGoneError } from '$lib/server/domain/contacts/require-visible';
import { askAgain, prepareContactReview } from '$lib/server/domain/import/review-view';
import { applyBookReview, prepareBookReview } from '$lib/server/domain/nextcloud/review';
import { importWording } from '$lib/server/i18n/import-wording';
import { say, translator } from '$lib/server/i18n/say';
import { parseAnswers } from './answers';
import { photoManifest, stagedStep, type StagedStep } from './staged';

/*
 * The vCard wizard's review step (docs/02 §2.16): who each incoming contact is, answered by
 * the member, then written as one. The answers live in the browser until *Import*; the server
 * re-reads the staged file and re-checks every answer against who the member may browse.
 * The linked Nextcloud book's new cards take the same step (docs/02 §2.16.3), matched against
 * shared people only, and need no photo step: a card's picture is stored by the server.
 */

const viewerOf = (locals: App.Locals) => {
	const user = requireAdmin(locals);
	return { id: user.id, householdId: user.householdId };
};

const AskAgainSchema = v.object({
	source: v.union([
		v.picklist(['vcard:google', 'vcard:nextcloud', 'vcard:other']),
		v.custom<NextcloudSource>((s) => typeof s === 'string' && s.startsWith('nextcloud:'))
	]),
	uid: v.pipe(v.string(), v.minLength(1))
});

/** The review step for a staged vCard. */
export async function reviewStep(locals: App.Locals, step: StagedStep) {
	const viewer = viewerOf(locals);
	const { nextcloud } = locals.services;
	return {
		step: 'review' as const,
		token: step.token,
		visibility: step.visibility,
		review:
			step.book && nextcloud
				? await prepareBookReview(nextcloud.bookReviewDeps, viewer, step.book)
				: await prepareContactReview(locals.services.archive.reviewViewDeps, viewer, step.text)
	};
}

export const reviewActions = {
	review: async ({ request, locals }: RequestEvent) => {
		const step = await stagedStep(await request.formData(), locals);
		if ('failure' in step) return step.failure;
		return reviewStep(locals, step);
	},

	importReviewed: async ({ request, locals }: RequestEvent) => {
		const viewer = viewerOf(locals);
		const form = await request.formData();
		const step = await stagedStep(form, locals);
		if ('failure' in step) return step.failure;
		const answers = parseAnswers(form.get('answers'));
		// The review is shown again, as it now stands, with what went wrong above it.
		const refused = async (error: string) =>
			fail(409, { ...(await reviewStep(locals, step)), error });
		if (answers === null) return refused(say(locals, 'import.review.error.unanswered'));

		try {
			const { nextcloud } = locals.services;
			if (step.book && nextcloud) {
				const outcome = await applyBookReview(nextcloud.bookReviewDeps, {
					viewer,
					source: step.book,
					answers,
					wording: importWording(locals),
					locale: locals.locale
				});
				return {
					step: 'reviewed' as const,
					token: step.token,
					visibility: step.visibility,
					added: outcome.added,
					completed: outcome.completed,
					skipped: outcome.skipped,
					linkPhotos: 0,
					photos: []
				};
			}
			const outcome = await applyContactReview(locals.services.archive.contactReviewDeps, {
				viewer,
				text: step.text,
				answers,
				visibility: step.visibility,
				wording: importWording(locals),
				locale: locals.locale
			});
			return {
				step: 'reviewed' as const,
				token: step.token,
				visibility: step.visibility,
				added: outcome.added,
				completed: outcome.completed,
				skipped: outcome.skipped,
				linkPhotos: outcome.linkPhotos,
				photos: photoManifest(outcome.photos)
			};
		} catch (err) {
			if (err instanceof ReviewUnansweredError || err instanceof ContactGoneError)
				return refused(err.phrase(translator(locals)));
			throw err;
		}
	},

	askAgain: async ({ request, locals }: RequestEvent) => {
		const viewer = viewerOf(locals);
		const form = await request.formData();
		const parsed = v.safeParse(AskAgainSchema, {
			source: form.get('source'),
			uid: form.get('uid')
		});
		const asked =
			parsed.success &&
			(await askAgain(
				locals.services.archive.reviewViewDeps,
				viewer,
				parsed.output.source,
				parsed.output.uid
			));
		// Someone else may have asked again a moment before; the list reloads either way.
		if (!asked)
			return fail(404, { step: 'upload' as const, error: say(locals, 'import.skipped.gone') });
		return { step: 'upload' as const };
	}
};
