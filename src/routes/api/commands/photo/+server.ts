import { json } from '@sveltejs/kit';
import type { CommandAnswer } from '$lib/commands/commands';
import { systemClock } from '$lib/server/clock';
import { parsePhotoCommand } from '$lib/server/commands/parse';
import { libraryCopyTakenAt } from '$lib/server/domain/immich/library';
import { answerFor } from '$lib/server/commands/receive';
import { translator } from '$lib/server/i18n/say';
import type { RequestHandler } from './$types';

/*
 * `POST /api/commands/photo` (docs/04 ADR-111): one photo for a command a
 * phone already sent, as multipart — `id`, `type` (`moment.photo`, `gallery.photo` or
 * `circleGallery.photo`), `parentId`, `image`, `thumb`, `width`, `height`, a large circle
 * photo's 1600 px `view`, and `takenAt` when the picture's EXIF said when it was taken — or, for a
 * copy from Immich, `immichToken`, the signed preview it was made from. The photo is a command of its own, so a resend after a lost answer is
 * recognised, and it answers as `POST /api/commands` does for each of its commands. A multipart post from another site is refused by SvelteKit's own
 * origin check before it gets here.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	const user = locals.user;
	if (!user) return json({ error: { code: 'unauthorized' } }, { status: 401 });

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return json({ error: { code: 'invalidForm' } }, { status: 400 });
	}
	const bytes = async (name: string) => {
		const file = form.get(name);
		return file instanceof File ? new Uint8Array(await file.arrayBuffer()) : null;
	};
	const id = form.get('id');
	// A copy from Immich is dated by what Immich said, signed into the preview it was made from
	// (docs/02 §2.24.9), not by what the browser sends.
	const immichToken = form.get('immichToken');
	const immich = locals.services.immich;
	const takenAt =
		typeof immichToken === 'string'
			? immich
				? await libraryCopyTakenAt(immich.signer, user, immichToken)
				: null
			: form.get('takenAt');
	const command = parsePhotoCommand({
		id,
		type: form.get('type'),
		parentId: form.get('parentId'),
		image: await bytes('image'),
		thumb: await bytes('thumb'),
		view: await bytes('view'),
		width: Number(form.get('width')),
		height: Number(form.get('height')),
		takenAt,
		issuedAt: systemClock.now()
	});
	const t = translator(locals);
	const named = typeof id === 'string' ? id : '';
	const answer: CommandAnswer = command
		? await answerFor(
				locals.services.offline.commandDeps,
				{ userId: user.id, householdId: user.householdId, locale: locals.locale },
				t,
				command
			)
		: { id: named, status: 'refused', reason: t('errors.command.malformed') };
	return json({ answer });
};
