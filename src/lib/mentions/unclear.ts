import type { PersonContext } from '../people/context';
import { tellApart, type Distinction, type Distinguishable } from '../people/namesakes';
import { createHandleResolver, resolveMentions, type MentionCandidate } from './mentions';

/*
 * A typed `@Thomas` several people answer to, asked about while the text is written (docs/02
 * §2.2.3): the same question the server refuses the text with, asked before saving is offered.
 */

/** A handle in the text that could be several people, and who each of them is. */
export interface UnclearHandle<P> {
	handle: string;
	people: { person: P; line: Distinction | null }[];
}

/**
 * Every typed handle in `stored` that more than one person on `audience` answers to — the people
 * the text may name — each told apart by the line the pickers show, `contexts` included.
 */
export function unclearHandles<P extends MentionCandidate & Distinguishable>(
	stored: string,
	audience: readonly P[],
	contexts: ReadonlyMap<string, PersonContext>
): UnclearHandle<P>[] {
	const { ambiguous } = resolveMentions(stored, createHandleResolver([...audience]));
	return ambiguous.map(({ handle, ids }) => {
		const people = audience.filter((p) => ids.includes(p.id));
		const lines = tellApart(people, contexts);
		return {
			handle,
			people: people.map((person) => ({ person, line: lines.get(person.id) ?? null }))
		};
	});
}
