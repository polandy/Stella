import {
	photoCommandFor,
	type CommandAnswer,
	type CommandPayloads,
	type JsonCommand,
	type PhotoCommandType,
	type RefusedTarget
} from '../commands/commands';

/*
 * The outbox (docs/concepts/offline-capture.md §4): what a phone holds back while Stella is
 * out of reach, and what becomes of it. Pure; `outbox-store.ts` keeps it on the device and
 * `outbox.svelte.ts` sends it. Every function returns a new list and leaves its input alone.
 *
 * The rule: **the outbox is the only copy of what the member wrote.** Nothing leaves it until
 * Stella has confirmed it (`applied`) or the member discards it. An item being edited is *held*
 * and never sent from under the editor, and one on its way (*sending*) cannot be edited or
 * discarded, because nobody can know whether Stella already has it.
 */

/**
 * How long a sending waits for Stella's answer before the round ends and what it carried waits
 * again. A phone that has lost its network does not always say so, and a request nobody
 * answers would otherwise hold every later save behind it. Giving up is safe: every command
 * carries its id, so one Stella took after all is recognised when it comes again.
 */
export const COMMAND_PATIENCE_MS = 10_000;

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

/**
 * Where an item stands. `pending` waits to be sent; `held` is open in the composer; `sending`
 * is in a request with no answer yet; `refused` came back with a reason the member can act on.
 */
export type OutboxState = 'pending' | 'held' | 'sending' | 'refused';

/** A photo kept with an entry or a gallery upload, already processed (downscaled, location stripped). */
export interface KeptPhoto {
	/** The photo's own command id, so an upload whose answer was lost is recognised. */
	id: string;
	image: Blob;
	thumb: Blob;
	/** A large group photo's 1600 px view, sent beside its full picture (docs/02 §2.4.2). */
	view?: Blob;
	width: number;
	height: number;
	/**
	 * When it was taken, read from its EXIF before the re-encode dropped it (docs/02 §2.14), so a
	 * photo kept for later still sorts where it belongs. Absent on photos kept by an older build.
	 */
	takenAt?: string | null;
}

/** One thing a member added while Stella could not be reached. */
export interface OutboxItem {
	command: JsonCommand;
	/** Whose it is: a different member signing in on the device never sees or sends it. */
	memberId: string;
	state: OutboxState;
	/** Why Stella refused it, in the member's language; null unless it was refused. */
	reason: string | null;
	/** When it was saved on the device (epoch ms). */
	savedAt: number;
	/** Photos still to be sent, after the item itself. */
	photos: KeptPhoto[];
	/**
	 * Who it is about, as the page named them when it was kept — for showing it anywhere but
	 * that person's own page, where no name can be looked up offline. Null for a moment, whose
	 * people are in its text.
	 */
	about: string | null;
	/**
	 * Stella has the item; only its photos wait. It is never sent again, and — being
	 * household data now — no longer edited here.
	 */
	delivered: boolean;
}

/** Append a newly written item. */
export function queue(
	items: readonly OutboxItem[],
	added: {
		command: JsonCommand;
		memberId: string;
		savedAt: number;
		photos?: KeptPhoto[];
		about?: string | null;
	}
): OutboxItem[] {
	return [
		...items,
		{
			...added,
			photos: added.photos ?? [],
			about: added.about ?? null,
			state: 'pending',
			reason: null,
			delivered: false
		}
	];
}

/** An item holding a command of type `T`. */
export type KeptOf<T extends JsonCommand['type']> = OutboxItem & {
	command: Extract<JsonCommand, { type: T }>;
};

/** Whether `item` holds a command of type `type`. */
export function isKept<T extends JsonCommand['type']>(item: OutboxItem, type: T): item is KeptOf<T> {
	return item.command.type === type;
}

/**
 * Take up to `max` of `memberId`'s pending items, oldest first, marking them *sending*.
 * Oldest first because a later item may name something an earlier one created.
 */
export function takeBatch(
	items: readonly OutboxItem[],
	memberId: string,
	max: number
): { items: OutboxItem[]; batch: JsonCommand[] } {
	const batch: JsonCommand[] = [];
	const next = items.map((item) => {
		if (batch.length >= max || item.memberId !== memberId || item.state !== 'pending' || item.delivered) {
			return item;
		}
		batch.push(item.command);
		return { ...item, state: 'sending' as const };
	});
	return { items: next, batch };
}

/**
 * Apply Stella's answers to what was in flight. *Applied* leaves — or, with photos still to
 * send, stays as delivered; *refused* stays with its reason; *busy*, *failed* and anything
 * left unanswered go back to waiting.
 */
export function settle(items: readonly OutboxItem[], answers: readonly CommandAnswer[]): OutboxItem[] {
	const byId = new Map(answers.map((a) => [a.id, a]));
	const next: OutboxItem[] = [];
	for (const item of items) {
		if (item.state !== 'sending') {
			next.push(item);
			continue;
		}
		const answer = byId.get(item.command.id);
		if (answer?.status === 'applied') {
			if (item.photos.length > 0) next.push({ ...item, state: 'pending', delivered: true });
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

/** The request never got an answer: everything in flight waits again. */
export function unsend(items: readonly OutboxItem[]): OutboxItem[] {
	return items.map((item) => (item.state === 'sending' ? { ...item, state: 'pending' } : item));
}

/**
 * Open an item for editing, so it is not sent meanwhile. Null when it is on its way, or
 * not there any more.
 */
export function hold(items: readonly OutboxItem[], id: string): OutboxItem[] | null {
	const item = items.find((i) => i.command.id === id);
	if (!item || item.state === 'sending' || item.delivered) return null;
	return items.map((i) => (i === item ? { ...i, state: 'held' } : i));
}

/** Close an edit without saving: the item goes back to where it was. */
export function release(items: readonly OutboxItem[], id: string): OutboxItem[] {
	return items.map((i) =>
		i.command.id === id && i.state === 'held'
			? { ...i, state: i.reason === null ? 'pending' : 'refused' }
			: i
	);
}

/**
 * Save an edit into a held item, which then waits to be sent again. A refused item becomes
 * a new command under `freshId`: Stella has already answered the old id, and the corrected
 * one is a different request. A pending item keeps its id, so a copy that did reach Stella
 * earlier is still recognised. Null when the item is not held.
 */
export function revise<T extends JsonCommand['type']>(
	items: readonly OutboxItem[],
	id: string,
	payload: CommandPayloads[T],
	freshId: string
): OutboxItem[] | null {
	const item = items.find((i) => i.command.id === id);
	if (!item || item.state !== 'held') return null;
	const command = {
		...item.command,
		id: item.reason === null ? item.command.id : freshId,
		payload
	} as JsonCommand;
	return items.map((i) => (i === item ? { ...i, command, state: 'pending', reason: null } : i));
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

/** The member does not want it any more. Null when it is on its way and cannot be recalled. */
export function discard(items: readonly OutboxItem[], id: string): OutboxItem[] | null {
	const item = items.find((i) => i.command.id === id);
	if (!item || item.state === 'sending') return null;
	return items.filter((i) => i !== item);
}

/**
 * Everything of `memberId`'s that can still be recalled, thrown away — they chose to at
 * sign-out. What is already on its way cannot be.
 */
export function discardAllOf(items: readonly OutboxItem[], memberId: string): OutboxItem[] {
	return items.filter((i) => i.memberId !== memberId || i.state === 'sending');
}

/**
 * The outbox as a freshly opened app finds it. An app closed mid-request left items
 * *sending* with no answer coming, and one closed mid-edit left them *held* with no editor.
 * Both go back to where they would be; a resend is safe, because Stella knows every id.
 */
export function recover(items: readonly OutboxItem[]): OutboxItem[] {
	return unsend(items).map((i) =>
		i.state === 'held' ? { ...i, state: i.reason === null ? 'pending' : 'refused' } : i
	);
}

/**
 * What became of a save the member is watching (concept §8 #10: online saves go through the
 * outbox too). *Applied* hands the form Stella's result; *refused* its reason, for the form to
 * show where the action's own error would be; *kept* means it waits on this device.
 */
export type Delivery =
	| { status: 'applied'; result: unknown }
	| { status: 'refused'; reason: string; refusals?: RefusedTarget[] }
	| { status: 'kept' };

/**
 * What Stella's answer to a watched save means for whoever watches it; null while that is not
 * known yet — a "not now", or photos of it still on their way.
 */
export function deliveryFor(answer: CommandAnswer, photosLeft: boolean): Delivery | null {
	if (answer.status === 'refused') {
		const { reason, refusals } = answer;
		return refusals ? { status: 'refused', reason, refusals } : { status: 'refused', reason };
	}
	if (answer.status === 'applied' && !photosLeft) return { status: 'applied', result: answer.result };
	return null;
}

/**
 * A watched save still unsettled when a sending round ends: done if Stella took it (`applied`,
 * only its photos left to send later), kept otherwise.
 */
export function deliveryLeftOver(applied: { result: unknown } | null): Delivery {
	return applied ? { status: 'applied', result: applied.result } : { status: 'kept' };
}
