import type { Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import { contextOfPeople, type PersonContextDeps } from '../contacts/person-context';
import { AmbiguousMentionError } from './resolve-for-audience';

/*
 * A refused `@Thomas` names each Thomas the way the pickers do (docs/02 §2.2.3), a namesake
 * with nothing typed included: by a relationship or a circle the author may see. Those are
 * read only once a text is refused, so a text that names nobody twice costs no extra query.
 */

export interface NamesakeContextDeps extends PersonContextDeps {
	/** The contact a member is, so a link to them reads *Your sibling*; null while unsaid. */
	selfContactOf(userId: string): Promise<string | null>;
	clock: Clock;
}

/**
 * Run `write`; when it refuses a handle several people answer to, refuse again with what
 * `viewer` may see of those people's relationships and circles. Anything else passes through.
 */
export async function withNamesakeContext<T>(
	deps: NamesakeContextDeps,
	viewer: Viewer,
	write: () => Promise<T>
): Promise<T> {
	try {
		return await write();
	} catch (err) {
		if (!(err instanceof AmbiguousMentionError)) throw err;
		const contexts = await contextOfPeople(deps, viewer, {
			people: err.people,
			selfContactId: await deps.selfContactOf(viewer.id),
			// The server's day, as the pickers' lines use (`(app)/+layout.server.ts`).
			today: new Date(deps.clock.now()).toLocaleDateString('en-CA')
		});
		throw err.withContext(new Map(Object.entries(contexts)));
	}
}
