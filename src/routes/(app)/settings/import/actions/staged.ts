import { fail } from '@sveltejs/kit';
import * as v from 'valibot';
import { getConfig } from '$lib/server/config';
import type { ImportedPhoto } from '$lib/server/domain/import/monica/plan';
import { readStagedDump } from '$lib/server/import/staging';
import { say } from '$lib/server/i18n/say';

/*
 * What the wizard's steps share (docs/02 §2.16): the staging token every step after the upload
 * posts, the export it names, and the photo list the last step walks.
 */

export const VisibilitySchema = v.optional(v.picklist(['shared', 'private']), 'shared');

export const StepSchema = v.object({
	token: v.pipe(v.string(), v.minLength(1)),
	visibility: VisibilitySchema
});

/** The step's token and visibility with the staged export, or the failure that sends to the upload. */
export async function stagedStep(form: FormData, locals: App.Locals) {
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
	const text = await readStagedDump(getConfig().importDir, parsed.output.token);
	if (text === null) {
		return {
			failure: fail(410, {
				step: 'upload' as const,
				error: say(locals, 'import.error.sessionGone')
			})
		};
	}
	return { ...parsed.output, text };
}

/** The photo list the browser walks: each id, and the file name to look for in Monica's folder. */
export function photoManifest(photos: readonly ImportedPhoto[]) {
	return photos.map((p) => ({
		id: p.id,
		file: p.sourcePath.split('/').pop() ?? p.sourcePath
	}));
}
