import { json } from '@sveltejs/kit';
import type { CommandAnswer } from '$lib/commands/commands';
import { systemClock } from '$lib/server/clock';
import { parsePhotoCommand } from '$lib/server/commands/parse';
import { answerFor } from '$lib/server/commands/receive';
import { translator } from '$lib/server/i18n/say';
import { getCommandDeps } from '$lib/server/services';
import type { RequestHandler } from './$types';

/*
 * `POST /api/commands/photo` (docs/concepts/offline-capture.md §4.2): one photo for a moment a
 * phone already sent, as multipart — `id`, `momentId`, `image`, `thumb`, `width`, `height`. The
 * photo is a command of its own, so a resend after a lost answer is recognised, and it answers
 * as `POST /api/commands` does for each of its commands. A multipart post from another site
 * is refused by SvelteKit's own origin check before it gets here.
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
	const command = parsePhotoCommand({
		id,
		momentId: form.get('momentId'),
		image: await bytes('image'),
		thumb: await bytes('thumb'),
		width: Number(form.get('width')),
		height: Number(form.get('height')),
		issuedAt: systemClock.now()
	});
	const t = translator(locals);
	const named = typeof id === 'string' ? id : '';
	const answer: CommandAnswer = command
		? await answerFor(getCommandDeps(), { userId: user.id, householdId: user.householdId }, t, command)
		: { id: named, status: 'refused', reason: t('errors.command.malformed') };
	return json({ answer });
};
