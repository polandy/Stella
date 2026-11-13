import type { EntryImmichPhoto } from '../../../immich/library';
import { LIBRARY_PICK_LIMIT } from '../../../immich/library-pick';
import { immichMediaUrl } from '../../../immich/media-url';
import type { Viewer } from '../../access/visibility';
import type { ImmichMediaSigner } from './signed-media';

/*
 * Immich photos on a journal entry, kept as references to the asset rather than copied (docs/02
 * §2.20, docs/04 ADR-132). A pick names its photos by the tokens the library picker handed out
 * (§2.24.9), so an entry only ever refers to a photo Stella listed for the member's household.
 * Nothing here asks Immich anything, and taking a reference off deletes only Stella's row: the
 * photo stays in Immich.
 */

/** One reference on an entry. */
export interface EntryImmichPhotoRef {
	journalEntryId: string;
	assetId: string;
}

/** The author's own entries' references, as editing them needs. */
export interface OwnEntryImmichPhotos {
	/** Refer to the assets from the entry when `authorId` wrote it; false when it is not theirs. */
	linkOwn(authorId: string, entryId: string, assetIds: readonly string[]): Promise<boolean>;
	/** Drop the reference when `authorId` wrote the entry; false when there was none. */
	unlinkOwn(authorId: string, entryId: string, assetId: string): Promise<boolean>;
}

/** The references a reader may see. */
export interface EntryImmichPhotoReads {
	/** The references on the entries among `entryIds` about the person, visible to the viewer, oldest first. */
	listOfEntries(
		viewer: Viewer,
		contactId: string,
		entryIds: readonly string[]
	): Promise<EntryImmichPhotoRef[]>;
}

export interface EntryImmichPhotoDeps {
	entries: OwnEntryImmichPhotos;
	signer: ImmichMediaSigner;
}

export type LinkOutcome = 'linked' | 'notConfigured' | 'invalid' | 'gone';

/**
 * Refer to the photos the picker's `tokens` name from the author's own entry. Every token must be
 * one Stella signed for the viewer's household and still valid; one that is not refuses the pick.
 * `deps` is null when this instance has no Immich.
 */
export async function linkImmichPhotosToOwnEntry(
	deps: EntryImmichPhotoDeps | null,
	viewer: Viewer,
	input: { entryId: string; tokens: readonly string[] }
): Promise<LinkOutcome> {
	if (!deps) return 'notConfigured';
	if (input.tokens.length === 0 || input.tokens.length > LIBRARY_PICK_LIMIT) return 'invalid';
	const assetIds: string[] = [];
	for (const token of input.tokens) {
		const verified = await deps.signer.verify(token);
		if (!verified.ok) return 'invalid';
		const { media } = verified;
		if (media.kind !== 'library' || media.householdId !== viewer.householdId) return 'invalid';
		assetIds.push(media.assetId);
	}
	return (await deps.entries.linkOwn(viewer.id, input.entryId, assetIds)) ? 'linked' : 'gone';
}

/** Take a reference off the author's own entry. Immich is not asked: the photo stays there. */
export function unlinkImmichPhotoFromOwnEntry(
	deps: Pick<EntryImmichPhotoDeps, 'entries'>,
	authorId: string,
	input: { entryId: string; assetId: string }
): Promise<boolean> {
	return deps.entries.unlinkOwn(authorId, input.entryId, input.assetId);
}

/**
 * The references grouped by entry, each with URLs signed for the viewer's household as the
 * library picker signs them; without Immich on the instance the references stay, unsigned.
 */
export async function signEntryImmichPhotos(
	signer: ImmichMediaSigner | null,
	viewer: Viewer,
	refs: readonly EntryImmichPhotoRef[]
): Promise<Map<string, EntryImmichPhoto[]>> {
	const byEntry = new Map<string, EntryImmichPhoto[]>();
	for (const ref of refs) {
		const photo = await signedPhoto(signer, viewer, ref.assetId);
		byEntry.set(ref.journalEntryId, [...(byEntry.get(ref.journalEntryId) ?? []), photo]);
	}
	return byEntry;
}

async function signedPhoto(
	signer: ImmichMediaSigner | null,
	viewer: Viewer,
	assetId: string
): Promise<EntryImmichPhoto> {
	if (!signer) return { assetId, thumbnailUrl: null, previewUrl: null };
	const photo = { kind: 'library', householdId: viewer.householdId, assetId } as const;
	const [thumbnail, preview] = await Promise.all([
		signer.sign({ ...photo, size: 'thumbnail' }),
		signer.sign({ ...photo, size: 'preview' })
	]);
	return {
		assetId,
		thumbnailUrl: immichMediaUrl(thumbnail),
		previewUrl: immichMediaUrl(preview)
	};
}

/** The person's entries among `entryIds` with the Immich photos the viewer may see on them, signed. */
export async function immichPhotosOfEntries(
	deps: { reads: EntryImmichPhotoReads; signer: ImmichMediaSigner | null },
	viewer: Viewer,
	contactId: string,
	entryIds: readonly string[]
): Promise<Map<string, EntryImmichPhoto[]>> {
	if (entryIds.length === 0) return new Map();
	const refs = await deps.reads.listOfEntries(viewer, contactId, entryIds);
	return signEntryImmichPhotos(deps.signer, viewer, refs);
}
