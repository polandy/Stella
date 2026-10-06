import type { Locale } from '../../../i18n/locales';
import type { Command, CommandPayloads, CommandType } from '../../../commands/commands';
import { TranslatableError } from '../../../errors/translatable';
import { phrase, type Phrase } from '../../../i18n/phrase';
import type { Clock } from '../../clock';
import type { CapturedMoment } from '../moments/moments';
import type { Visibility } from '../../access/visibility';

/*
 * The command dispatcher (docs/concepts/offline-capture.md §3, docs/04 §4.9). Every change a
 * member makes arrives as a command and is applied here, once, however often it arrives: a
 * phone that lost its connection after Stella saved something sends it again, and the answer
 * must be "done" rather than a second copy.
 *
 * So the command's id is *claimed* before its handler runs and the result kept when it is
 * done. The tables stay the truth — a receipt is never replayed; it only remembers that an
 * id was applied, and what came of it. Access is checked where it always is, in the handler's
 * reads; the dispatcher adds no authorisation of its own.
 */

/** Who is issuing the command. */
export interface CommandActor {
	userId: string;
	householdId: string;
	/** The member's language: names a command writes take its quote marks (docs/02 §2.2). */
	locale: Locale;
}

/** What each command answers with when it is applied. */
export interface CommandResults {
	/** What a later photo needs to find its entry, too (`photos.ts`). */
	'moment.capture': CapturedMoment & { visibility: Visibility };
	/** The stored photo's id. */
	'moment.photo': string;
	/** Shaped like a moment's, so a photo following it lands the same way. */
	'journal.write': { entryId: string; anchorContactId: string; visibility: Visibility };
	'field.add': { fieldId: string };
	'date.add': { dateId: string };
	/** Where the photos following it go. */
	'gallery.add': { contactId: string; visibility: Visibility };
	/** The stored photo's id. */
	'gallery.photo': string;
	/** Where the photos following it go, with the role as the circle spells it. */
	'circleGallery.add': { circleId: string; role: string | null; visibility: Visibility };
	/** The stored photo's id. */
	'circleGallery.photo': string;
	'note.add': { noteId: string };
	'interaction.log': { interactionId: string };
	'tag.assign': { tagId: string };
	'circle.join': { circleId: string };
	'relationship.add': { relationshipId: string };
	/** One id per picked person, in the order they were picked. */
	'relationship.addMany': { relationshipIds: string[] };
	'contact.add': { contactId: string };
}

/** The use-case behind each command. */
export type CommandHandlers = {
	[T in CommandType]: (
		actor: CommandActor,
		payload: CommandPayloads[T]
	) => Promise<CommandResults[T]>;
};

/** A claimed or applied command id. */
export interface CommandReceipt {
	id: string;
	memberId: string;
	householdId: string;
	type: CommandType;
	/** `pending` while a run holds the claim, `applied` once its result is kept. */
	status: 'pending' | 'applied';
	/** The handler's result, once applied. */
	result: unknown;
	claimedAt: number;
}

/** The receipt book. Receipts are kept for good: they hold ids, not content. */
export interface CommandReceiptRepository {
	/** The receipt for `id`, or null. */
	find(id: string): Promise<CommandReceipt | null>;
	/** Claim `receipt.id`: null when the claim is now ours, else the receipt already there. */
	claim(receipt: Omit<CommandReceipt, 'status' | 'result'>): Promise<CommandReceipt | null>;
	/** Take over a pending claim, only if it is still the one claimed at `claimedAt`. */
	reclaim(id: string, claimedAt: number, at: number): Promise<boolean>;
	/** Mark a claim applied and keep its result. */
	complete(id: string, result: unknown, at: number): Promise<void>;
	/** Give a claim up, so the same id can be sent again. */
	release(id: string): Promise<void>;
}

export interface CommandDeps {
	receipts: CommandReceiptRepository;
	clock: Clock;
	handlers: CommandHandlers;
}

/** What became of a command of type `T`. */
export type CommandOutcome<T extends CommandType = CommandType> =
	| {
			status: 'applied';
			result: CommandResults[T];
			/** True when this was a resend of a command applied earlier. */
			repeated: boolean;
	  }
	/**
	 * The member can act on this: correct the command and send it again. `error` is the
	 * handler's own refusal, so an edge can read what it carries — which people a batch of
	 * links was refused for — rather than parse the sentence; absent when the dispatcher refused.
	 */
	| { status: 'refused'; reason: Phrase; error?: TranslatableError }
	/** Another run is applying this very command right now; ask again later. */
	| { status: 'busy' };

/**
 * A command that broke for a reason that is ours, not the member's: a bug, a constraint the
 * handler did not foresee, a full disk. Only a `TranslatableError` is a refusal; anything else
 * leaves the dispatcher as this, named by the command it broke, so the edge that logs it
 * (`hooks.server.ts`'s `handleError`, the outbox's `answerFor`) can say what the member was
 * doing. The original error is the `cause`.
 */
export class CommandFailedError extends Error {
	readonly commandType: CommandType;
	readonly commandId: string;

	constructor(command: Pick<Command, 'id' | 'type'>, cause: unknown) {
		super(`Command ${command.id} (${command.type}) failed`, { cause });
		this.name = 'CommandFailedError';
		this.commandType = command.type;
		this.commandId = command.id;
	}
}

/**
 * How long a claim may stay pending before it is presumed abandoned — its run stopped
 * between claiming and completing. Far longer than any handler takes; a run cut short is a
 * crash, not a slow request.
 */
export const CLAIM_STALE_AFTER_MS = 60_000;

/**
 * Apply `command` for `actor`, once. A refusal the member can act on is an answer, never a
 * throw; anything else is thrown as a `CommandFailedError`, and a caller does not catch it.
 */
export async function dispatchCommand<C extends Command>(
	deps: CommandDeps,
	actor: CommandActor,
	command: C
): Promise<CommandOutcome<C['type']>> {
	const at = deps.clock.now();
	const existing = await deps.receipts.claim({
		id: command.id,
		memberId: actor.userId,
		householdId: actor.householdId,
		type: command.type,
		claimedAt: at
	});

	if (existing) {
		// An id is one member's one command. Anything else reusing it is not a resend.
		if (existing.memberId !== actor.userId || existing.type !== command.type) {
			return { status: 'refused', reason: phrase('errors.command.idTaken') };
		}
		if (existing.status === 'applied') {
			return {
				status: 'applied',
				result: existing.result as CommandResults[C['type']],
				repeated: true
			};
		}
		// Pending: either another run is inside the handler, or one died there. A duplicate is
		// visible and can be removed; a moment presumed saved but never written is gone.
		const abandoned = at - existing.claimedAt > CLAIM_STALE_AFTER_MS;
		if (!abandoned || !(await deps.receipts.reclaim(command.id, existing.claimedAt, at))) {
			return { status: 'busy' };
		}
	}

	let result: CommandResults[C['type']];
	try {
		result = (await apply(deps.handlers, actor, command)) as CommandResults[C['type']];
	} catch (err) {
		await deps.receipts.release(command.id);
		if (err instanceof TranslatableError)
			return { status: 'refused', reason: err.phrase, error: err };
		throw new CommandFailedError(command, err);
	}
	await deps.receipts.complete(command.id, result, deps.clock.now());
	return { status: 'applied', result, repeated: false };
}

/** Run the handler for `command`'s type, with its payload narrowed to that type. */
function apply(
	handlers: CommandHandlers,
	actor: CommandActor,
	command: Command
): Promise<CommandResults[CommandType]> {
	switch (command.type) {
		case 'moment.capture':
			return handlers[command.type](actor, command.payload);
		case 'moment.photo':
			return handlers[command.type](actor, command.payload);
		case 'note.add':
			return handlers[command.type](actor, command.payload);
		case 'interaction.log':
			return handlers[command.type](actor, command.payload);
		case 'tag.assign':
			return handlers[command.type](actor, command.payload);
		case 'circle.join':
			return handlers[command.type](actor, command.payload);
		case 'relationship.add':
			return handlers[command.type](actor, command.payload);
		case 'relationship.addMany':
			return handlers[command.type](actor, command.payload);
		case 'contact.add':
			return handlers[command.type](actor, command.payload);
		case 'journal.write':
			return handlers[command.type](actor, command.payload);
		case 'field.add':
			return handlers[command.type](actor, command.payload);
		case 'date.add':
			return handlers[command.type](actor, command.payload);
		case 'gallery.add':
			return handlers[command.type](actor, command.payload);
		case 'gallery.photo':
			return handlers[command.type](actor, command.payload);
		case 'circleGallery.add':
			return handlers[command.type](actor, command.payload);
		case 'circleGallery.photo':
			return handlers[command.type](actor, command.payload);
	}
}
