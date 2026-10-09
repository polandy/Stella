import type { Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import { clearsNoLastName } from '../../../surnames/review';
import type { NameRepository } from './name-parts';

/*
 * *No last name* (docs/02 §2.2.4.2): the household's answer that a person has none and that
 * this is fine, so the *Last names* list stops asking about them. Kept on the person
 * (`contact.without_last_name_at`, docs/03), so it is one answer for every member and travels
 * with them in the archive. *Ask again* takes it back; a last name given later clears it.
 */

/** The port the mark is written through (docs/08 §8.3). */
export interface WithoutLastNameRepository extends Pick<NameRepository, 'findByIdVisibleTo'> {
	/** Set the mark to `at`, or clear it with null. The caller has checked visibility. */
	markWithoutLastName(id: string, at: number | null): Promise<void>;
}

export interface WithoutLastNameDeps {
	withoutLastName: WithoutLastNameRepository;
	clock: Clock;
}

/**
 * Settle a person as having no last name. False when the person is not visible to the viewer.
 * Someone given a last name since the list was drawn has nothing to settle: nothing is written.
 */
export async function settleWithoutLastName(
	deps: WithoutLastNameDeps,
	viewer: Viewer,
	contactId: string
): Promise<boolean> {
	const person = await deps.withoutLastName.findByIdVisibleTo(viewer, contactId);
	if (person === null) return false;
	if (clearsNoLastName(person.lastName)) return true;
	await deps.withoutLastName.markWithoutLastName(contactId, deps.clock.now());
	return true;
}

/** *Ask again*: the person is back on the list. False when the person is not visible. */
export async function askAgainForLastName(
	deps: WithoutLastNameDeps,
	viewer: Viewer,
	contactId: string
): Promise<boolean> {
	if ((await deps.withoutLastName.findByIdVisibleTo(viewer, contactId)) === null) return false;
	await deps.withoutLastName.markWithoutLastName(contactId, null);
	return true;
}
