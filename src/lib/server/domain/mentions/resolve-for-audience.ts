import { TranslatableError } from '../../../errors/translatable';
import type { Phrase } from '../../../i18n/phrase';
import { allowedForAudience } from '../../../mentions/audience';
import {
	createHandleResolver,
	resolveMentions,
	type AmbiguousHandle,
	type MentionCandidate
} from '../../../mentions/mentions';
import type { PersonContext } from '../../../people/context';
import { describeDistinction, tellApart, type Distinguishable } from '../../../people/namesakes';
import type { Visibility } from '../../access/visibility';
import type { ContactSummary } from '../contacts/contacts';

/*
 * Resolving what a text names (docs/02 §2.20.1) — a moment, a note, a journal entry and its
 * edit alike. Only the people the text's audience may name count, so a mention never widens
 * access; and a typed handle that is several of them is asked about, never guessed or silently
 * dropped (§2.2.3). A mention picked in the @-picker arrives as an id token and is not a
 * question at all.
 */

type Candidate = MentionCandidate & Distinguishable;

/**
 * People an entry of the given visibility may reference (docs/02 §2.20.1): a shared entry only
 * household-visible contacts, a private entry anyone the author can see — so a mention never
 * widens access.
 */
export function audienceCandidates(
	contacts: ContactSummary[],
	visibility: Visibility
): Candidate[] {
	return allowedForAudience(contacts, visibility).map((c) => ({
		id: c.id,
		firstName: c.firstName,
		lastName: c.lastName,
		displayName: c.displayName,
		description: c.description,
		metPlace: c.metPlace,
		metDate: c.metDate
	}));
}

/**
 * Thrown when a typed handle could be several people; names each so the author can choose.
 * `contexts` is what the author may see of those people's relationships and circles, which
 * tells apart a namesake with nothing typed (`withNamesakeContext` reads it).
 */
export class AmbiguousMentionError extends TranslatableError {
	/** The people the refused handles could be, and nobody else. */
	readonly people: readonly Candidate[];

	constructor(
		readonly ambiguous: readonly AmbiguousHandle[],
		candidates: readonly Candidate[],
		contexts: ReadonlyMap<string, PersonContext> = new Map()
	) {
		const people = candidates.filter((c) => ambiguous.some(({ ids }) => ids.includes(c.id)));
		super(ambiguityPhrase(ambiguous, people, contexts), 'AmbiguousMentionError');
		this.people = people;
	}

	/** The same refusal, naming each person with `contexts` to fall back on. */
	withContext(contexts: ReadonlyMap<string, PersonContext>): AmbiguousMentionError {
		return new AmbiguousMentionError(this.ambiguous, this.people, contexts);
	}
}

function ambiguityPhrase(
	ambiguous: readonly AmbiguousHandle[],
	candidates: readonly Candidate[],
	contexts: ReadonlyMap<string, PersonContext>
): Phrase {
	return (t) =>
		ambiguous
			.map(({ handle, ids }) => {
				const people = candidates.filter((c) => ids.includes(c.id));
				const lines = tellApart(people, contexts);
				const named = people.map((p) => {
					const line = lines.get(p.id);
					return line ? `${p.displayName} (${describeDistinction(t, line)})` : p.displayName;
				});
				return t('errors.mention.ambiguous', {
					handle,
					count: people.length,
					people: named.join(', ')
				});
			})
			.join(' ');
}

/**
 * The body as stored and the people it names, in order — only ever people the audience may
 * name, however they were written. Refuses with `AmbiguousMentionError`
 * when a typed handle could be more than one person the audience may name.
 */
export function resolveForAudience(
	contacts: ContactSummary[],
	visibility: Visibility,
	body: string
): { body: string; ids: string[] } {
	const candidates = audienceCandidates(contacts, visibility);
	const resolved = resolveMentions(body, createHandleResolver(candidates));
	if (resolved.ambiguous.length > 0)
		throw new AmbiguousMentionError(resolved.ambiguous, candidates);
	// A token names someone only if the audience may: one arriving for a person deleted since
	// (a moment kept on a phone) or hidden from this audience links nobody.
	const allowed = new Set(candidates.map((c) => c.id));
	return { body: resolved.body, ids: resolved.ids.filter((id) => allowed.has(id)) };
}
