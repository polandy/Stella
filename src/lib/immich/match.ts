/*
 * Which Immich person a contact probably is, by name (docs/concepts/immich.md §4.2). Pure: the
 * *Find your people* list (docs/02 §2.24.7) reads the household's contacts and Immich's named
 * people through the access layer and the gateway, and this decides what to propose.
 *
 * A name agreeing is a hint, not a proof — the face settles it. So the rules only decide how
 * sure the list may sound: a full name that agrees is *likely*, and gets a one-tap Link; a
 * nickname or a first name alone is a *maybe*, as is one half of a double last name, and so is
 * anything ambiguous — two faces with the
 * same name, or one face that two people in Stella share a name with. A maybe never links
 * without a member picking the face.
 */

/** What matching reads of a contact. */
export interface MatchableContact {
	id: string;
	displayName: string;
	firstName: string | null;
	lastName: string | null;
	nickname: string | null;
}

/** What matching reads of a person in Immich. */
export interface MatchableImmichPerson {
	id: string;
	/** Empty when nobody named the face. */
	name: string;
	hidden: boolean;
}

export type MatchStrength = 'likely' | 'maybe';

/** One face proposed for a contact, and how sure the name makes it. */
export interface MatchCandidate {
	personId: string;
	strength: MatchStrength;
}

/**
 * One row of the list: a contact and the faces proposed for them. `likely` only when there is
 * exactly one, it is a likely match, and no other contact is a likely match for it — the rows
 * *Link all likely* may take without asking.
 */
export interface ImmichMatch {
	contactId: string;
	kind: MatchStrength;
	candidates: MatchCandidate[];
}

export interface MatchInput {
	contacts: readonly MatchableContact[];
	people: readonly MatchableImmichPerson[];
	/** Contacts already linked: never proposed again — linking would replace their link. */
	linkedContactIds: ReadonlySet<string>;
	/** Immich people already linked to someone, whether or not the viewer sees them. */
	linkedPersonIds: ReadonlySet<string>;
	/**
	 * Pairs a member said are not the same person. Never proposed again — but the face stays free
	 * for anyone else, and the contact for any other face.
	 */
	ignoredPairs: readonly { contactId: string; personId: string }[];
}

/** Letters NFD does not take apart, written the way they are typed without them. */
const UNDECOMPOSED: Record<string, string> = {
	ß: 'ss',
	æ: 'ae',
	œ: 'oe',
	ø: 'o',
	ł: 'l',
	đ: 'd',
	þ: 'th'
};

/**
 * A name folded onto one spelling: case, accents and the German transliteration go, so that
 * `Müller`, `Mueller` and `muller` agree. The transliterated pairs (`ae`, `oe`, `ue`) are folded
 * onto their plain vowel on *both* sides, which also merges some names that merely contain them
 * ("Raphael" and "Raphal") — harmless for a list that only proposes. Anything that is not a
 * letter or a digit separates words.
 */
export function foldName(name: string): string {
	return name
		.toLowerCase()
		.replace(/[ßæœøłđþ]/g, (letter) => UNDECOMPOSED[letter])
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim()
		.replace(/ae/g, 'a')
		.replace(/oe/g, 'o')
		.replace(/ue/g, 'u');
}

const isOneWord = (folded: string) => folded !== '' && !folded.includes(' ');
const isFullName = (folded: string) => folded.includes(' ');

/** The contact's names as folded keys: the full ones, and the ones that are a single name. */
function namesOf(contact: MatchableContact) {
	const fold = (value: string | null) => (value ? foldName(value) : '');
	const [first, last, nick, shown] = [
		fold(contact.firstName),
		fold(contact.lastName),
		fold(contact.nickname),
		fold(contact.displayName)
	];
	const full = new Set(
		[shown, first && last ? `${first} ${last}` : '', nick && last ? `${nick} ${last}` : ''].filter(
			isFullName
		)
	);
	const single = new Set(
		[first, nick, isOneWord(shown) ? shown : ''].filter((name) => name !== '')
	);
	// A double last name is often only half there on the other side: Stella's "Sandra
	// Brunner-Keller" is "Sandra Brunner" in Immich. One half with the first name is a maybe.
	const halves = last.includes(' ') ? last.split(' ') : [];
	const partial = new Set(
		[first, nick]
			.filter((given) => given !== '')
			.flatMap((given) => halves.map((half) => `${given} ${half}`))
	);
	return { full, single, partial, hasLastName: last !== '' };
}

/** How sure a name makes the pair, or null when it says nothing. */
function strengthOf(names: ReturnType<typeof namesOf>, immichName: string): MatchStrength | null {
	if (names.full.has(immichName)) return 'likely';
	if (isOneWord(immichName)) return names.single.has(immichName) ? 'maybe' : null;
	if (names.partial.has(immichName)) return 'maybe';
	// A full name in Immich for someone Stella knows by a single name: the first name agrees, and
	// nothing on Stella's side disagrees.
	if (!names.hasLastName) {
		for (const name of names.single) if (immichName.startsWith(`${name} `)) return 'maybe';
	}
	return null;
}

/** One pair as a set key; ids hold no NUL, so the joint is unambiguous. */
const pairKey = (contactId: string, personId: string) => `${contactId}\u0000${personId}`;

/** The rows of *Find your people*, likely ones first, each part in the order of the names. */
export function matchImmichPeople(input: MatchInput): ImmichMatch[] {
	const people = input.people
		.filter((p) => !p.hidden && !input.linkedPersonIds.has(p.id))
		.map((p) => ({ id: p.id, name: p.name, folded: foldName(p.name) }))
		.filter((p) => p.folded !== '');
	const contacts = input.contacts.filter((c) => !input.linkedContactIds.has(c.id));
	const ignored = new Set(input.ignoredPairs.map((pair) => pairKey(pair.contactId, pair.personId)));

	const found = contacts.map((contact) => {
		const names = namesOf(contact);
		const candidates: (MatchCandidate & { name: string })[] = [];
		for (const p of people) {
			// Dropped before anything is weighed: an ignored likely match leaves room for the
			// contact's maybes, and stops making the face a doubt for anyone else.
			if (ignored.has(pairKey(contact.id, p.id))) continue;
			const strength = strengthOf(names, p.folded);
			if (strength) candidates.push({ personId: p.id, strength, name: p.name });
		}
		return { contact, candidates };
	});

	// How many contacts each face is the likely match of. A face somebody's full name agrees with
	// is theirs to confirm, not a first-name guess for anyone else; one shared by two is a doubt.
	const likelyFor = new Map<string, number>();
	for (const { candidates } of found)
		for (const c of candidates)
			if (c.strength === 'likely') likelyFor.set(c.personId, (likelyFor.get(c.personId) ?? 0) + 1);

	const compare = new Intl.Collator(undefined, { sensitivity: 'base' }).compare;
	const rows: (ImmichMatch & { displayName: string })[] = [];
	for (const { contact, candidates } of found) {
		const likely = candidates.filter((c) => c.strength === 'likely');
		const kept = likely.length > 0 ? likely : candidates.filter((c) => !likelyFor.has(c.personId));
		if (kept.length === 0) continue;
		kept.sort((a, b) => compare(a.name, b.name) || a.personId.localeCompare(b.personId));
		const sure =
			kept.length === 1 && kept[0].strength === 'likely' && likelyFor.get(kept[0].personId) === 1;
		rows.push({
			contactId: contact.id,
			displayName: contact.displayName,
			kind: sure ? 'likely' : 'maybe',
			candidates: kept.map(({ personId, strength }) => ({ personId, strength }))
		});
	}

	const rank = (kind: MatchStrength) => (kind === 'likely' ? 0 : 1);
	rows.sort(
		(a, b) =>
			rank(a.kind) - rank(b.kind) ||
			compare(a.displayName, b.displayName) ||
			a.contactId.localeCompare(b.contactId)
	);
	return rows.map(({ contactId, kind, candidates }) => ({ contactId, kind, candidates }));
}
