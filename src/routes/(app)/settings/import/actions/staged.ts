import { fail, type ActionFailure } from '@sveltejs/kit';
import * as v from 'valibot';
import { getConfig } from '$lib/server/config';
import type { NextcloudSource } from '$lib/import-match/card';
import type { Visibility } from '$lib/server/access/visibility';
import type { ImportedPhoto } from '$lib/server/domain/import/monica/plan';
import { unansweredCards } from '$lib/server/domain/nextcloud/review';
import { readStagedDump } from '$lib/server/import/staging';
import { say } from '$lib/server/i18n/say';

/*
 * What the wizard's steps share (docs/02 §2.16): the staging token every step after the upload
 * posts, the export it names, and the photo list the last step walks.
 *
 * The linked Nextcloud book's review (docs/02 §2.16.3) runs through the same steps under one
 * fixed token instead of a staged file's: its cards are read from what the sync holds at every
 * step, its people are always shared, and as a staged token is a ULID, no upload can pose as it.
 */

/** The token the linked book's review posts; never a ULID, so never a staged file. */
export const BOOK_TOKEN = 'nextcloud';

/** A step's staged text; `book` names the linked book when the text is its new cards. */
export interface StagedStep {
	token: string;
	visibility: Visibility;
	text: string;
	book: NextcloudSource | null;
}

export const VisibilitySchema = v.optional(v.picklist(['shared', 'private']), 'shared');

export const StepSchema = v.object({
	token: v.pipe(v.string(), v.minLength(1)),
	visibility: VisibilitySchema
});

/** The step's token and visibility with the staged export, or the failure that sends to the upload. */
export async function stagedStep(
	form: FormData,
	locals: App.Locals
): Promise<StagedStep | { failure: ActionFailure<{ step: 'upload'; error: string }> }> {
	const parsed = v.safeParse(StepSchema, {
		token: form.get('token'),
		visibility: form.get('visibility') || undefined
	});
	if (!parsed.success) {
		return {
			failure: fail(400, {
				step: 'upload' as const,
				error: say(locals, 'import.error.sessionMissing')
			})
		};
	}
	const { token } = parsed.output;
	const step =
		token === BOOK_TOKEN
			? await bookStep(locals)
			: await readStagedDump(getConfig().importDir, token).then((text) =>
					text === null ? null : { ...parsed.output, text, book: null }
				);
	if (step === null) {
		return {
			failure: fail(410, {
				step: 'upload' as const,
				error: say(locals, 'import.error.sessionGone')
			})
		};
	}
	return step;
}

/** The linked book's new cards as a step; null when this instance has no linked book. */
export async function bookStep(locals: App.Locals): Promise<StagedStep | null> {
	const nextcloud = locals.services.nextcloud;
	if (!nextcloud || !locals.user) return null;
	const viewer = { id: locals.user.id, householdId: locals.user.householdId };
	const { source } = nextcloud.link;
	const text = await unansweredCards(nextcloud.bookReviewDeps, viewer, source);
	return { token: BOOK_TOKEN, visibility: 'shared', text, book: source };
}

/** The photo list the browser walks: each id, and the file name to look for in Monica's folder. */
export function photoManifest(photos: readonly ImportedPhoto[]) {
	return photos.map((p) => ({
		id: p.id,
		file: p.sourcePath.split('/').pop() ?? p.sourcePath
	}));
}
