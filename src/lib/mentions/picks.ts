import { MENTION_TOKEN_RE, mentionToken, type MentionCandidate } from './mentions';
import { handleFor } from './picker';
import { newPersonMentionId, type MomentNewPerson } from '../commands/commands';

/*
 * Remembering whom a picked `@Handle` stands for (docs/02 §2.20.1). The field shows the
 * readable `@Thomas`, and a handle alone cannot say which of two people called Thomas was
 * meant — so the picker remembers the pick against the range of text it wrote, and on saving
 * that range becomes the person's id token. Pure and client-safe: the pickers carry picks
 * through every edit and write the stored form themselves.
 */

/** The person picked for the handle at `text[start, end)`. */
export interface MentionPick {
	start: number;
	end: number;
	id: string;
}

const NAME_CHAR = /[\p{L}\p{N}]/u;
const WHOLE_HANDLE = /^@\p{L}[\p{L}\p{N}]*$/u;

/**
 * Carry picks across one edit from `before` to `after`. The edit is the span between the two
 * texts' common prefix and suffix: a pick before it stays, a pick after it moves by the change
 * in length, and a pick it touches is let go — its name is no longer the one that was picked.
 * A name character typed straight onto the end of a handle changes the name too.
 */
export function shiftPicks(
	before: string,
	after: string,
	picks: readonly MentionPick[]
): MentionPick[] {
	let prefix = 0;
	while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix])
		prefix++;
	let suffix = 0;
	while (
		suffix < before.length - prefix &&
		suffix < after.length - prefix &&
		before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
	)
		suffix++;
	const changedUntil = before.length - suffix;
	const delta = after.length - before.length;

	return picks.flatMap((pick) => {
		const endsBefore =
			pick.end < prefix || (pick.end === prefix && !NAME_CHAR.test(after[prefix] ?? ''));
		if (endsBefore) return [pick];
		if (pick.start >= changedUntil)
			return [{ ...pick, start: pick.start + delta, end: pick.end + delta }];
		return [];
	});
}

/**
 * The text as it is stored: every range that still holds a whole handle becomes the id token of
 * the person picked there. Handles nobody picked stay as typed, for the server to look up by name.
 */
export function toStored(text: string, picks: readonly MentionPick[]): string {
	let out = text;
	for (const pick of [...picks].sort((a, b) => b.start - a.start)) {
		const holdsHandle =
			WHOLE_HANDLE.test(text.slice(pick.start, pick.end)) &&
			!NAME_CHAR.test(text[pick.end] ?? '') &&
			!/[\p{L}\p{N}@\\]/u.test(text[pick.start - 1] ?? '');
		if (holdsHandle) out = out.slice(0, pick.start) + mentionToken(pick.id) + out.slice(pick.end);
	}
	return out;
}

/**
 * A stored body made editable: each id token shown as the person's handle, with a pick so saving
 * writes the same person back. A token whose person `handleOf` cannot name stays a token, so
 * editing the text around it does not lose them.
 */
export function toEditable(
	body: string,
	handleOf: (id: string) => string | null
): { text: string; picks: MentionPick[] } {
	let text = '';
	const picks: MentionPick[] = [];
	let last = 0;
	for (const match of body.matchAll(MENTION_TOKEN_RE)) {
		const start = match.index ?? 0;
		text += body.slice(last, start);
		const handle = handleOf(match[1]);
		if (handle) {
			picks.push({ start: text.length, end: text.length + handle.length, id: match[1] });
			text += handle;
		} else {
			text += match[0];
		}
		last = start + match[0].length;
	}
	return { text: text + body.slice(last), picks };
}

/** A stored body read back as typed, handles for tokens — for text shown rather than edited. */
export function asTyped(body: string, people: readonly MentionCandidate[]): string {
	return toEditable(body, (id) => {
		const person = people.find((p) => p.id === id);
		return person ? handleFor(person) : null;
	}).text;
}

/** Id for a bare name an older build queued; never written as a token, only listed. */
const QUEUED_NAME_PREFIX = 'new-name:';

/** Whether a listed person is a name an older build queued, found by name rather than by id. */
export function isQueuedName(id: string): boolean {
	return id.startsWith(QUEUED_NAME_PREFIX);
}

/**
 * The people a moment creates, as the picker lists them: under the placeholder id their mention
 * carries until Stella has them, so picking one writes that placeholder.
 */
export function newPeopleAsCandidates(
	newPeople: readonly (string | MomentNewPerson)[]
): MentionCandidate[] {
	return newPeople.map((person) =>
		typeof person === 'string'
			? { id: QUEUED_NAME_PREFIX + person, displayName: person, firstName: null, lastName: null }
			: {
					id: newPersonMentionId(person.key),
					displayName: [person.firstName, person.lastName].filter(Boolean).join(' '),
					firstName: person.firstName,
					lastName: person.lastName
				}
	);
}
