import type { CommandAnswer, CommandPayloads, JsonCommand } from '../commands/commands';

/*
 * The outbox (docs/02 §2.18.1): what a phone holds back while Stella is
 * out of reach, and what becomes of it. Pure; `outbox-store.ts` keeps it on the device,
 * `outbox.svelte.ts` sends it, and `outbox-photos.ts` sends the photos that follow an item. Every function returns a new list and leaves its input alone.
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
	/**
	 * For a copy of a photo from Immich (docs/02 §2.24.9): the signed token of the preview it was
	 * made from, by which the server dates it as Immich did — `takenAt` is then not read.
	 */
	immichToken?: string;
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
	/**
	 * It went out and no answer settled it, so Stella may have it. Absent on an item never sent,
	 * and on items kept by an older build.
	 */
	unanswered?: true;
	/**
	 * The member changed it after it went out unanswered, and it kept its id: if Stella answers
	 * that it already had that id, what it has is the earlier version (`refuseLostEdits`).
	 */
	changedAfterSending?: true;
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
export function isKept<T extends JsonCommand['type']>(
	item: OutboxItem,
	type: T
): item is KeptOf<T> {
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
		if (
			batch.length >= max ||
			item.memberId !== memberId ||
			item.state !== 'pending' ||
			item.delivered
		) {
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
export function settle(
	items: readonly OutboxItem[],
	answers: readonly CommandAnswer[]
): OutboxItem[] {
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
				: { ...item, state: 'pending', unanswered: true }
		);
	}
	return next;
}

/**
 * Stella's answers, with one change: an item edited after an unanswered send (`changedAfterSending`)
 * that Stella says it *already* applied is refused with `earlier`. Stella answered with the
 * result of the version it got first and never read the edit, so letting the item go would
 * drop the member's change without a word. Refused, it stays: edited again it goes out as a
 * new command, discarded it leaves the earlier version as Stella has it.
 */
export function refuseLostEdits(
	items: readonly OutboxItem[],
	answers: readonly CommandAnswer[],
	earlier: string
): CommandAnswer[] {
	const changed = new Set(
		items
			.filter((item) => item.state === 'sending' && item.changedAfterSending)
			.map((item) => item.command.id)
	);
	return answers.map((answer) =>
		answer.status === 'applied' && answer.repeated && changed.has(answer.id)
			? { id: answer.id, status: 'refused', reason: earlier }
			: answer
	);
}

/** The request never got an answer: everything in flight waits again, and Stella may have it. */
export function unsend(items: readonly OutboxItem[]): OutboxItem[] {
	return items.map((item) =>
		item.state === 'sending' ? { ...item, state: 'pending', unanswered: true } : item
	);
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
 * earlier is still recognised — and if it may have (`unanswered`), the edit is marked, so
 * that recognition refuses it rather than drop it (`refuseLostEdits`). Null when the item is
 * not held.
 */
export function revise<T extends JsonCommand['type']>(
	items: readonly OutboxItem[],
	id: string,
	payload: CommandPayloads[T],
	freshId: string
): OutboxItem[] | null {
	const item = items.find((i) => i.command.id === id);
	if (!item || item.state !== 'held') return null;
	const keepsId = item.reason === null;
	const command = {
		...item.command,
		id: keepsId ? item.command.id : freshId,
		payload
	} as JsonCommand;
	const { unanswered, changedAfterSending, ...rest } = item;
	const revised: OutboxItem = { ...rest, command, state: 'pending', reason: null };
	if (keepsId && (unanswered || changedAfterSending)) {
		revised.unanswered = true;
		revised.changedAfterSending = true;
	}
	return items.map((i) => (i === item ? revised : i));
}

/** Whether the member can still take it back here: waiting or refused, not on its way or open. */
export function recallable(item: OutboxItem): boolean {
	return item.state === 'pending' || item.state === 'refused';
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
