import type { ActivityOf } from '../activity/activity';
import type { RestoreCounts } from '../archive/import';

/**
 * The log line a restore writes with its rows (docs/02 §2.15), for adapter tests that are about
 * the rows. Each call gets its own id, so the same archive can be restored twice in one test.
 */
export function restoreTrail(
	householdId: string,
	actorId: string
): (counts: RestoreCounts) => ActivityOf<'archive.restored'> {
	let n = 0;
	return (counts) => ({
		id: `a-restore-${++n}`,
		householdId,
		actorId,
		createdAt: 0,
		event: {
			kind: 'archive.restored',
			people: counts.contact?.added ?? 0,
			household: 'Familie Brunner',
			locale: 'en'
		}
	});
}
