import type { CommandAnswer, JsonCommand } from '../commands/commands';
import { COMMAND_PATIENCE_MS } from './outbox';
import { PHOTO_PATIENCE_MS, photoAnswer, type PhotoUpload } from './outbox-photos';

/*
 * The two requests the outbox sends (docs/02 §2.18.1, docs/04 §4.11.2): a batch of commands
 * to `POST /api/commands`, and one photo to `POST /api/commands/photo`. An adapter, like
 * `outbox-store.ts`; what an answer does to the list is `outbox.ts`'s and `outbox-photos.ts`'s.
 * Null always means "no answer from Stella": out of reach, too slow, or someone else answering.
 */

/** The answers in a response, or null when it is not an answer from Stella at all. */
async function answersFrom(response: Response): Promise<CommandAnswer[] | null> {
	if (!response.ok) return null;
	try {
		const body = (await response.json()) as { answers?: unknown };
		return Array.isArray(body.answers) ? (body.answers as CommandAnswer[]) : null;
	} catch {
		// A captive portal or a proxy answering in Stella's place.
		return null;
	}
}

/** Send `batch`, and Stella's answer for each command in it. */
export async function postCommands(batch: readonly JsonCommand[]): Promise<CommandAnswer[] | null> {
	try {
		const response = await fetch('/api/commands', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ commands: batch }),
			signal: AbortSignal.timeout(COMMAND_PATIENCE_MS)
		});
		return await answersFrom(response);
	} catch {
		// Out of reach, or no answer in time. Everything waits for the next chance.
		return null;
	}
}

/** Upload one photo, and Stella's answer for it; `tooLarge` is the reason a 413 is refused with. */
export async function postPhoto(
	{ parentId, type, photo }: PhotoUpload,
	tooLarge: string
): Promise<CommandAnswer | null> {
	const form = new FormData();
	form.set('id', photo.id);
	form.set('type', type);
	form.set('parentId', parentId);
	form.set('image', photo.image, 'photo.jpg');
	form.set('thumb', photo.thumb, 'thumb.jpg');
	if (photo.view) form.set('view', photo.view, 'view.jpg');
	form.set('width', String(photo.width));
	form.set('height', String(photo.height));
	if (photo.takenAt) form.set('takenAt', photo.takenAt);
	if (photo.immichToken) form.set('immichToken', photo.immichToken);
	try {
		const response = await fetch('/api/commands/photo', {
			method: 'POST',
			body: form,
			signal: AbortSignal.timeout(PHOTO_PATIENCE_MS)
		});
		const sent = response.ok
			? (((await response.json()) as { answer?: CommandAnswer }).answer ?? null)
			: null;
		return photoAnswer(photo.id, response.status, sent, tooLarge);
	} catch {
		// Out of reach, or not Stella answering: the photo waits.
		return null;
	}
}
