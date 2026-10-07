/*
 * Who wrote a stream row, as a face (docs/05 §5.5). A row leads with its subject's avatar —
 * the face one scans for — and names the actor in its sentence. With more than one writing
 * member a reader scanning faces could take the subject for the author, so a small actor
 * avatar overlaps the subject's — but only on rows by somebody else: *You* is what a reader
 * assumes, and a badge on most rows of a one-writer week would be noise.
 */

import { offersMemberChoice } from './filter';

/** Whether a row carries the actor badge. */
export function showsActorBadge(item: { mine: boolean }, members: readonly unknown[]): boolean {
	return !item.mine && offersMemberChoice(members);
}
