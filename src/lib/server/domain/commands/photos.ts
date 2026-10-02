import type { PhotoPayload } from '../../../commands/commands';
import { TranslatableError } from '../../../errors/translatable';
import { phrase } from '../../../i18n/phrase';
import { addCirclePhoto, type CirclePhotoDeps } from '../circles/circle-photos';
import type { CircleRepository } from '../circles/circles';
import type { ContactRepository } from '../contacts/contacts';
import { addGalleryPhoto, type GalleryUploadDeps } from '../media/gallery-upload';
import { attachJournalPhoto, type JournalPhotoDeps } from '../media/journal-photos';
import type { CommandActor, CommandReceipt, CommandReceiptRepository, CommandResults } from './dispatch';

/*
 * A photo that follows the command it belongs to (docs/concepts/offline-capture.md §4.2). A
 * phone sends a kept moment, journal-page entry or gallery upload first and its photos after,
 * each photo naming that command by id. The command's receipt says where the photo goes; it
 * lands there as it would have had it come in the same request.
 *
 * Checked on arrival like everything else: only the same member's applied command, and only
 * while where it points is still theirs to add to — a photo arriving days later may find the
 * entry deleted or the person gone.
 */

/** What a photo names is not one of the member's delivered commands (any more). */
export class PhotoParentGoneError extends TranslatableError {
	constructor() {
		super(phrase('errors.command.photoParentGone'), 'PhotoParentGoneError');
	}
}

/** Whether a journal entry still exists and was written by `authorId`. */
export interface EntryOwnership {
	ownsEntry(authorId: string, entryId: string): Promise<boolean>;
}

/** The member's own applied receipt for `parentId` if it is of one of `types`; else refused. */
async function appliedParent<T extends keyof CommandResults>(
	receipts: Pick<CommandReceiptRepository, 'find'>,
	actor: CommandActor,
	parentId: string,
	types: readonly T[]
): Promise<CommandResults[T]> {
	const receipt: CommandReceipt | null = await receipts.find(parentId);
	if (
		!receipt ||
		receipt.memberId !== actor.userId ||
		receipt.status !== 'applied' ||
		!(types as readonly string[]).includes(receipt.type)
	) {
		throw new PhotoParentGoneError();
	}
	return receipt.result as CommandResults[T];
}

export interface MomentPhotoDeps {
	receipts: Pick<CommandReceiptRepository, 'find'>;
	entries: EntryOwnership;
	photos: JournalPhotoDeps;
}

/** Attach a photo to the entry its moment or journal-page entry went into; returns its id. */
export async function attachMomentPhoto(
	deps: MomentPhotoDeps,
	actor: CommandActor,
	payload: PhotoPayload
): Promise<string> {
	const entry = await appliedParent(deps.receipts, actor, payload.parentId, ['moment.capture', 'journal.write']);
	if (!(await deps.entries.ownsEntry(actor.userId, entry.entryId))) throw new PhotoParentGoneError();

	return attachJournalPhoto(deps.photos, actor, {
		contactId: entry.anchorContactId,
		journalEntryId: entry.entryId,
		visibility: entry.visibility,
		upload: { image: payload.image, thumb: payload.thumb, width: payload.width, height: payload.height }
	});
}

export interface GalleryPhotoDeps {
	receipts: Pick<CommandReceiptRepository, 'find'>;
	contacts: Pick<ContactRepository, 'findByIdVisibleTo'>;
	photos: GalleryUploadDeps;
}

/** Add a photo to the gallery its upload was for; returns the photo's id. */
export async function attachGalleryPhoto(
	deps: GalleryPhotoDeps,
	actor: CommandActor,
	payload: PhotoPayload
): Promise<string> {
	const gallery = await appliedParent(deps.receipts, actor, payload.parentId, ['gallery.add']);
	const viewer = { id: actor.userId, householdId: actor.householdId };
	if (!(await deps.contacts.findByIdVisibleTo(viewer, gallery.contactId))) throw new PhotoParentGoneError();

	return addGalleryPhoto(deps.photos, actor, {
		contactId: gallery.contactId,
		visibility: gallery.visibility,
		upload: { image: payload.image, thumb: payload.thumb, width: payload.width, height: payload.height }
	});
}

export interface CirclePhotoUploadDeps {
	receipts: Pick<CommandReceiptRepository, 'find'>;
	circles: Pick<CircleRepository, 'getVisibleTo'>;
	photos: Pick<CirclePhotoDeps, 'circlePhotos' | 'media' | 'ids' | 'clock'>;
}

/** Add a photo to the circle its upload was for, with the upload's role; returns its id. */
export async function attachCirclePhoto(
	deps: CirclePhotoUploadDeps,
	actor: CommandActor,
	payload: PhotoPayload
): Promise<string> {
	const upload = await appliedParent(deps.receipts, actor, payload.parentId, ['circleGallery.add']);
	const viewer = { id: actor.userId, householdId: actor.householdId };
	if (!(await deps.circles.getVisibleTo(viewer, upload.circleId))) throw new PhotoParentGoneError();

	return addCirclePhoto(deps.photos, actor, {
		circleId: upload.circleId,
		role: upload.role,
		visibility: upload.visibility,
		upload: { image: payload.image, thumb: payload.thumb, width: payload.width, height: payload.height }
	});
}
