import type { Viewer } from '../../access/visibility';
import type { GiftDeps } from './gifts';

/*
 * A gift kept from the person it is for (docs/dev/02 §2.25.10). Only a member can be kept from
 * anything — a person who is nobody's own never opens Stella — and never by themselves.
 */

/** Whether the viewer's gift form may offer *Everyone but …* for this person. */
export async function mayKeepFrom(
	deps: Pick<GiftDeps, 'gifts'>,
	viewer: Viewer,
	contactId: string
): Promise<boolean> {
	const member = await deps.gifts.memberWhoseOwnPerson(viewer.householdId, contactId);
	return member !== null && member !== viewer.id;
}
