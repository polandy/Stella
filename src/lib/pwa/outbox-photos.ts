import { photoCommandFor, type CommandAnswer, type PhotoCommandType } from '../commands/commands';
import type { KeptPhoto, OutboxItem } from './outbox';

/*
 * The photos kept with an outbox item (docs/02 §2.18.1): sent one at a time once Stella has the
 * item they follow, and what an upload's answer does to it. Pure, like `outbox.ts`.
 */

/** The same for one photo, which is megabytes rather than a few lines of text. */
export const PHOTO_PATIENCE_MS = 60_000;

/**
 * What a photo upload's response says. A 413 comes from the server in front of Stella, not
 * Stella itself: the photo is over its request cap (`BODY_SIZE_LIMIT`, docs/07) and would be
 * turned away on every try, so it is refused with `tooLarge` instead of waiting for ever.
 * Anything else that is not Stella's answer may pass next time, so it waits (null).
 */
export function photoAnswer(
	id: string,
	httpStatus: number,
	answer: CommandAnswer | null,
	tooLarge: string
): CommandAnswer | null {
	if (httpStatus === 413) return { id, status: 'refused', reason: tooLarge };
	return answer;
}

/** One photo on its way, sent as `type` and naming the command it follows. */
export interface PhotoUpload {
	parentId: string;
	type: PhotoCommandType;
	photo: KeptPhoto;
}

/**
 * The next photo of `memberId`'s to upload, from an item Stella already has, marking that
 * item *sending*; null when there is none.
 */
export function takePhoto(
	items: readonly OutboxItem[],
	memberId: string
): { items: OutboxItem[]; upload: PhotoUpload } | null {
	const item = items.find(
		(i) => i.memberId === memberId && i.delivered && i.state === 'pending' && i.photos.length > 0
	);
	const type = item && photoCommandFor(item.command.type);
	if (!item || !type) return null;
	return {
		items: items.map((i) => (i === item ? { ...i, state: 'sending' } : i)),
		upload: { parentId: item.command.id, type, photo: item.photos[0] }
	};
}

/**
 * Apply Stella's answer to one photo upload (null: no answer came). *Applied* drops the photo,
 * and the item with its last one; *refused* stays with the reason; anything else waits.
 */
export function settlePhoto(
	items: readonly OutboxItem[],
	parentId: string,
	photoId: string,
	answer: CommandAnswer | null
): OutboxItem[] {
	const next: OutboxItem[] = [];
	for (const item of items) {
		if (item.command.id !== parentId || item.state !== 'sending') {
			next.push(item);
			continue;
		}
		if (answer?.status === 'applied') {
			const photos = item.photos.filter((p) => p.id !== photoId);
			if (photos.length > 0) next.push({ ...item, photos, state: 'pending' });
			continue;
		}
		next.push(
			answer?.status === 'refused'
				? { ...item, state: 'refused', reason: answer.reason }
				: { ...item, state: 'pending' }
		);
	}
	return next;
}
