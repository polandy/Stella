import {
	MAX_COMMAND_BATCH,
	type Command,
	type CommandAnswer,
	type CommandPayloads
} from '../commands/commands';
import {
	discard,
	hold,
	queue,
	recover,
	release,
	revise,
	settle,
	takeBatch,
	unsend,
	type OutboxItem
} from './outbox';
import { readOutbox, updateOutbox } from './outbox-store';

/*
 * The outbox on this device, as a rune the page reads (docs/concepts/offline-capture.md §4).
 * An adapter: what each step *means* is `outbox.ts`, where it is tested; this file keeps the
 * list in IndexedDB, sends it to `POST /api/commands`, and mirrors it for the page.
 *
 * Sending is tried when the app opens, when Stella is reported reachable again, when the tab
 * comes back into view and right after something is saved — never on a timer. A send that
 * gets no answer puts everything back as it was; Stella knows every command's id, so trying
 * again can never save anything twice.
 */

/** What this device holds, whoever's it is; the page only ever shows `mine`. */
let items = $state<OutboxItem[]>([]);
let memberId = $state<string | null>(null);
let sending = false;
let whenApplied: () => void = () => {};

/** Change the stored list with `change` and mirror the result. */
async function apply(change: (list: OutboxItem[]) => OutboxItem[]): Promise<void> {
	items = await updateOutbox(change);
}

/**
 * Change the stored list with a step that may refuse (returns null); true when it did not.
 * A refusal leaves the list as it was.
 */
async function attempt(step: (list: OutboxItem[]) => OutboxItem[] | null): Promise<boolean> {
	let done = false;
	await apply((list) => {
		const next = step(list);
		done = next !== null;
		return next ?? list;
	});
	return done;
}

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

export const outbox = {
	/** This member's items, oldest first. */
	get mine(): OutboxItem[] {
		return items.filter((item) => item.memberId === memberId);
	},

	/**
	 * Start for the signed-in member: pick up where a closed app left off, then try to send.
	 * `onApplied` runs whenever Stella took something, so the page can read it back.
	 */
	async start(member: string, onApplied: () => void): Promise<void> {
		memberId = member;
		whenApplied = onApplied;
		await apply(recover);
		await outbox.send();
	},

	/** Read the list again — another tab on this device may have changed it. */
	async refresh(): Promise<void> {
		items = await readOutbox();
	},

	/** Keep `command` until it can be sent, then try at once. */
	async add(command: Command): Promise<void> {
		const member = memberId;
		if (!member) throw new Error('The outbox was used before a member signed in.');
		await apply((list) => queue(list, { command, memberId: member, savedAt: Date.now() }));
		void outbox.send();
	},

	/** Open an item for editing; false when it is already on its way. */
	hold: (id: string): Promise<boolean> => attempt((list) => hold(list, id)),

	/** Close an edit without saving. */
	release: (id: string): Promise<void> => apply((list) => release(list, id)),

	/** Save an edit and try to send it. `freshId` names it anew if it had been refused. */
	async revise<T extends Command['type']>(
		id: string,
		payload: CommandPayloads[T],
		freshId: string
	): Promise<boolean> {
		const done = await attempt((list) => revise(list, id, payload, freshId));
		if (done) void outbox.send();
		return done;
	},

	/** Throw an item away; false when it is on its way and cannot be recalled. */
	discard: (id: string): Promise<boolean> => attempt((list) => discard(list, id)),

	/** Send what waits, batch by batch, until nothing does or Stella stops answering. */
	async send(): Promise<void> {
		const member = memberId;
		if (sending || !member) return;
		sending = true;
		try {
			for (;;) {
				let batch: Command[] = [];
				await apply((list) => {
					const taken = takeBatch(list, member, MAX_COMMAND_BATCH);
					batch = taken.batch;
					return taken.items;
				});
				if (batch.length === 0) return;

				let answers: CommandAnswer[] | null = null;
				try {
					const response = await fetch('/api/commands', {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ commands: batch })
					});
					answers = await answersFrom(response);
				} catch {
					// Out of reach. Everything waits for the next chance.
				}
				if (!answers) {
					await apply(unsend);
					return;
				}
				const answered = answers;
				await apply((list) => settle(list, answered));
				if (answered.some((a) => a.status === 'applied')) whenApplied();
				// Busy or failed means "not now": another round would get the same answer.
				if (answered.some((a) => a.status === 'busy' || a.status === 'failed')) return;
			}
		} finally {
			sending = false;
		}
	}
};
