import { phrase } from '../../../i18n/phrase';
import { TranslatableError } from '../../../i18n/translatable';
import type { Viewer } from '../../access/visibility';
import { sentImmichAssets, type EntryImmichPhotoDeps } from '../immich/entry-immich-photos';

/*
 * The composer's Immich picks, carried in its outbox command as the picker's signed tokens
 * (docs/dev/02 §2.20, docs/dev/04 ADR-132): the tokens are read before the entry is written, so a
 * refusal writes nothing, and the entry the write lands in — a new one or one it joined — refers
 * to the photos. Nothing is copied and Immich is not asked.
 */

/**
 * Run `write`, then refer to the photos `tokens` name from the entry it wrote. `deps` is null when
 * this instance has no Immich: a pick sent after it was removed is refused, the text with it.
 */
export async function writeReferringToImmich<R extends { entryId: string }>(
	deps: EntryImmichPhotoDeps | null,
	viewer: Viewer,
	tokens: readonly string[] | undefined,
	write: () => Promise<R>
): Promise<R> {
	if (!tokens?.length) return write();
	const assetIds = await sentImmichAssets(deps?.signer ?? null, viewer, tokens);
	if (assetIds === 'notConfigured' || !deps) {
		throw new TranslatableError(phrase('errors.photo.immichNotConnected'));
	}
	if (assetIds === 'invalid') throw new TranslatableError(phrase('errors.photo.fromImmichGone'));
	const written = await write();
	if (!(await deps.entries.linkOwn(viewer.id, written.entryId, assetIds))) {
		throw new Error(`entry ${written.entryId} was just written, yet is not the author's`);
	}
	return written;
}
