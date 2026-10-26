import { foldAddress } from './same-address';

/*
 * *Settings → Data quality → Same address* (docs/02 §2.17, §2.2 *A shared home*): people whose
 * own address lines are one address after folding, offered as one home. Exact only (Q3): the
 * fold is `foldAddress`, nothing looser. A home that already has the line is offered to join
 * instead of a new one. Nothing here writes; the caller passes only people the viewer may see.
 */

export interface SameAddressPerson {
	id: string;
	displayName: string;
}

/** One own `address` field of a person the viewer may see. */
export interface OwnLine {
	contactId: string;
	fieldId: string;
	value: string;
}

/** A home at least one person the viewer may see lives in; `livesHere` names only those. */
export interface HomeAtLine {
	id: string;
	value: string;
	livesHere: SameAddressPerson[];
}

export interface SameAddressInput {
	people: readonly SameAddressPerson[];
	ownLines: readonly OwnLine[];
	homes: readonly HomeAtLine[];
	/** The household's *Not the same* answers, as stored keys (`sameAddressKey`). */
	dismissals: readonly string[];
}

export interface SameAddressFinding {
	/** What *Not the same* stores for this group. */
	key: string;
	folded: string;
	/** The line as shown: the home's, else the first person's. */
	line: string;
	/** Everyone with the line as an own address, by name, each with their own spelling. */
	people: (SameAddressPerson & { line: string })[];
	/** The home to join, or null when a new one is made. */
	home: { id: string; livesHere: SameAddressPerson[] } | null;
}

export interface SameAddressCheck {
	open: SameAddressFinding[];
	/** Findings a *Not the same* holds back, with the stored key that does — what *Ask again* deletes. */
	declined: (SameAddressFinding & { dismissedAs: string })[];
}

/**
 * The stored answer: the people's ids, sorted and comma-joined, a space, the folded line. A ULID
 * holds neither a comma nor a space, so the first space splits the two.
 */
export const sameAddressKey = (folded: string, contactIds: readonly string[]): string =>
	`${[...contactIds].sort().join(',')} ${folded}`;

export function parseSameAddressKey(key: string): { folded: string; contactIds: string[] } | null {
	const at = key.indexOf(' ');
	if (at <= 0 || at === key.length - 1) return null;
	return { folded: key.slice(at + 1), contactIds: key.slice(0, at).split(',') };
}

const byName = (a: SameAddressPerson, b: SameAddressPerson) =>
	a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id);

export function findSameAddresses(input: SameAddressInput): SameAddressCheck {
	const seen = new Map(input.people.map((p) => [p.id, p]));

	// Folded line → person → their first spelling of it.
	const byLine = new Map<string, Map<string, string>>();
	for (const own of input.ownLines) {
		if (!seen.has(own.contactId)) continue;
		const folded = foldAddress(own.value);
		if (folded.length === 0) continue;
		const holders = byLine.get(folded) ?? new Map<string, string>();
		if (!holders.has(own.contactId)) holders.set(own.contactId, own.value);
		byLine.set(folded, holders);
	}

	// The home at each line that most people live in; the first given wins a tie.
	const homeAt = new Map<string, HomeAtLine>();
	for (const home of input.homes) {
		const folded = foldAddress(home.value);
		const best = homeAt.get(folded);
		if (folded.length > 0 && (!best || home.livesHere.length > best.livesHere.length)) {
			homeAt.set(folded, home);
		}
	}

	const answers = input.dismissals.flatMap((key) => {
		const parsed = parseSameAddressKey(key);
		return parsed ? [{ key, folded: parsed.folded, ids: new Set(parsed.contactIds) }] : [];
	});

	const check: SameAddressCheck = { open: [], declined: [] };
	const findings = [...byLine.entries()].flatMap(([folded, holders]): SameAddressFinding[] => {
		const home = homeAt.get(folded) ?? null;
		if (!home && holders.size < 2) return [];
		const people = [...holders.entries()]
			.map(([id, line]) => ({ ...seen.get(id)!, line }))
			.sort(byName);
		return [
			{
				key: sameAddressKey(folded, [...holders.keys()]),
				folded,
				line: home?.value ?? people[0]!.line,
				people,
				home: home ? { id: home.id, livesHere: [...home.livesHere].sort(byName) } : null
			}
		];
	});

	for (const finding of findings.sort((a, b) => a.line.localeCompare(b.line))) {
		// Said for these people at this line, or for a group they were all part of then.
		const answer = answers.find(
			(a) => a.folded === finding.folded && finding.people.every((p) => a.ids.has(p.id))
		);
		if (answer) check.declined.push({ ...finding, dismissedAs: answer.key });
		else check.open.push(finding);
	}
	return check;
}
