import type { MomentPhotoPayload } from '../../../commands/commands';
import { TranslatableError } from '../../../errors/translatable';
import { phrase } from '../../../i18n/phrase';
import { attachJournalPhoto, type JournalPhotoDeps } from '../media/journal-photos';
import type { CommandActor, CommandReceiptRepository, CommandResults } from './dispatch';

/*
 * A photo that follows its moment (docs/concepts/offline-capture.md §4.2). A phone sends a
 * kept moment first and its photos after, each photo naming the moment by its command id. The
 * receipt of that command says which journal entry the moment went into; the photo lands there,
 * with the moment's visibility, as it would have had it come in the same request.
 *
 * Checked on arrival like everything else: only the same member's applied moment, and only
 * while its entry is still theirs — a photo arriving days later may find it deleted.
 */

/** The moment a photo names is not one of the member's delivered moments (any more). */
export class MomentNotDeliveredError extends TranslatableError {
	constructor() {
		super(phrase('errors.command.noSuchMoment'), 'MomentNotDeliveredError');
	}
}

/** Whether a journal entry still exists and was written by `authorId`. */
export interface EntryOwnership {
	ownsEntry(authorId: string, entryId: string): Promise<boolean>;
}

export interface MomentPhotoDeps {
	receipts: Pick<CommandReceiptRepository, 'find'>;
	entries: EntryOwnership;
	photos: JournalPhotoDeps;
}

/** Attach a photo to the entry its moment went into; returns the photo's id. */
export async function attachMomentPhoto(
	deps: MomentPhotoDeps,
	actor: CommandActor,
	payload: MomentPhotoPayload
): Promise<string> {
	const receipt = await deps.receipts.find(payload.momentId);
	if (
		!receipt ||
		receipt.memberId !== actor.userId ||
		receipt.type !== 'moment.capture' ||
		receipt.status !== 'applied'
	) {
		throw new MomentNotDeliveredError();
	}
	const moment = receipt.result as CommandResults['moment.capture'];
	if (!(await deps.entries.ownsEntry(actor.userId, moment.entryId))) throw new MomentNotDeliveredError();

	return attachJournalPhoto(deps.photos, actor, {
		contactId: moment.anchorContactId,
		journalEntryId: moment.entryId,
		visibility: moment.visibility,
		upload: { image: payload.image, thumb: payload.thumb, width: payload.width, height: payload.height }
	});
}
