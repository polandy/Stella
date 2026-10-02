import { invalidateAll } from '$app/navigation';
import type { Translate } from '$lib/i18n/translate';
import { whilePending } from '$lib/sync/pending';
import type { PendingSink } from '$lib/sync/pending-work';
import type { Removals } from '$lib/undo/context.svelte';
import { submitAction } from '$lib/undo/submit-action';

/*
 * A batch of links stored together (`relationship.addMany`, docs/02 §2.4) gets one toast and
 * one *Undo*, wherever it was saved from: the relationship form, or *Add all* on the *Also
 * true?* block (docs/concepts/multi-pick-relationships.html D6, D7). An adapter — it holds the
 * fetch and the reload, nothing to decide.
 */

/** The ids a batch answered with; anything else is not ours and says so. */
export function relationshipIdsOf(result: unknown): string[] {
	const ids = (result as { relationshipIds?: unknown } | null)?.relationshipIds;
	if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) {
		throw new Error('relationship.addMany answered without its relationship ids');
	}
	return ids;
}

/** What announcing a batch needs from the page it was saved on. */
export interface SavedBatchContext {
	/** The person page the toast stands on; its `?/removeRelationships` takes the batch back. */
	contactId: string;
	removals: Removals;
	pending: PendingSink;
	t: Translate;
}

/** "2 links saved · Undo", where *Undo* takes every link of the batch back in one step. */
export function announceSavedBatch(context: SavedBatchContext, relationshipIds: readonly string[]): void {
	const { contactId, removals, pending, t } = context;
	removals.notify(t('contact.relationships.linksSaved', { count: relationshipIds.length }), () => {
		const body = new FormData();
		for (const id of relationshipIds) body.append('relationshipId', id);
		void whilePending(pending, () =>
			submitAction(fetch, `/contacts/${contactId}?/removeRelationships`, body, { keepalive: false })
		)
			.then(() => invalidateAll())
			.catch((error: unknown) => {
				console.error('Could not take back the links saved together:', error);
				removals.notify(t('contact.relationships.undoLinksFailed'));
			});
	});
}
