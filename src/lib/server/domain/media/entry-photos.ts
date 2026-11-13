import type { Visibility } from '../../access/visibility';
import type { DeletedPhotoFiles, MediaStore } from './avatars';
import {
	attachJournalPhoto,
	type ImageUpload,
	type JournalPhotoDeps,
	type PhotoUploader
} from './journal-photos';

/*
 * Photos added to or taken off a journal entry while it is edited (docs/02 §2.20). Only the
 * entry's author edits it, so only they add or remove its photos; a photo added inherits the
 * entry's anchor and audience, as one written with the entry does.
 */

/** Where an entry's photos belong: its anchor and its audience. */
export interface OwnEntry {
	contactId: string;
	visibility: Visibility;
}

/** The author's own entries, as editing their photos needs them. */
export interface OwnEntries {
	/** The entry when `authorId` wrote it; null when it is gone or someone else's. */
	findOwnEntry(authorId: string, entryId: string): Promise<OwnEntry | null>;
	/**
	 * Delete a photo of the entry when `authorId` wrote the entry, returning its files; null
	 * when the photo is not on that entry or the entry is not theirs.
	 */
	deleteOwnEntryPhoto(
		authorId: string,
		entryId: string,
		photoId: string
	): Promise<DeletedPhotoFiles | null>;
}

export interface EntryPhotoDeps extends JournalPhotoDeps {
	entries: OwnEntries;
	media: Pick<MediaStore, 'put' | 'delete'>;
}

/** Add a photo to the author's own entry; its id, or null when the entry is not theirs. */
export async function addPhotoToOwnEntry(
	deps: EntryPhotoDeps,
	author: PhotoUploader,
	input: { entryId: string; upload: ImageUpload }
): Promise<string | null> {
	const entry = await deps.entries.findOwnEntry(author.userId, input.entryId);
	if (!entry) return null;
	return attachJournalPhoto(deps, author, {
		contactId: entry.contactId,
		journalEntryId: input.entryId,
		visibility: entry.visibility,
		upload: input.upload
	});
}

/**
 * Take a photo off the author's own entry and delete its files. The row goes first: should
 * unlinking fail, the photo is already gone from every view.
 */
export async function removePhotoFromOwnEntry(
	deps: Pick<EntryPhotoDeps, 'entries' | 'media'>,
	authorId: string,
	input: { entryId: string; photoId: string }
): Promise<boolean> {
	const files = await deps.entries.deleteOwnEntryPhoto(authorId, input.entryId, input.photoId);
	if (!files) return false;
	await deps.media.delete(files.filePath);
	await deps.media.delete(files.thumbPath);
	return true;
}
