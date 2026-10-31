import { PARENT_CHILD_TYPE_KEY } from '../relationships/type-keys';
import { encodeRelationshipChoice } from '../relationships/type-options';

/*
 * The cards a person's page can be pointed at (docs/05 §5.5). Here rather than in the page
 * component because the ids are a shared vocabulary: a form action redirects back to the card
 * it acted on, the passive "Mentioned in" list builds such a link per reference (docs/02
 * §2.20.1), and the card itself carries the id as its anchor. Three spellings of "notes" in
 * three files would drift on the first rename.
 *
 * These were tabs until the person's page put its content in one column (docs/05 §5.5). Links
 * with the old `?tab=` are still answered — see `sectionForLegacyTab`.
 */

/**
 * Every addressable card, in the order the page shows them under the identity card: who they
 * belong with, what was taken, then the story and the notes (side by side on a wide screen),
 * the gifts (docs/02 §2.25), and last where somebody else named them. The To do card (docs/02
 * §2.26) moves: right under the identity card while something is open, here at the end, before
 * *Mentioned in*, while nothing is. The identity card itself is the page's top and needs no
 * anchor.
 */
export const CONTACT_SECTIONS = [
	'relationships',
	'photos',
	'story',
	'notes',
	'gifts',
	'todos',
	'mentions'
] as const;

export type ContactSection = (typeof CONTACT_SECTIONS)[number];

/** The id the card carries, and the fragment that scrolls to it. */
export function sectionAnchor(section: ContactSection): string {
	return `section-${section}`;
}

/**
 * A link to one card of a person's page — the one place this URL is spelled. `query` (without
 * its `?`) is what the page should open there — `review`, `propose=…`, `relate=…` — and is
 * spelled as given, so the propose pairs keep their `:` and `,` readable.
 */
export function contactSectionPath(
	contactId: string,
	section: ContactSection,
	query?: string
): string {
	const question = query === undefined ? '' : `?${query}`;
	return `/contacts/${contactId}${question}#${sectionAnchor(section)}`;
}

/** Which card a passive reference opens: a note is read on Notes, an entry in the story. */
export const SECTION_FOR_REFERENCE = {
	note: 'notes',
	journal: 'story'
} as const satisfies Record<string, ContactSection>;

/**
 * What the tabs were called while the page had them. A bookmark or a browser-history entry
 * still carries `?tab=people`, and dropping it on the floor would land the reader at the top
 * of the page with no hint that their link meant something.
 */
export const SECTION_FOR_LEGACY_TAB = {
	people: 'relationships',
	story: 'story',
	notes: 'notes',
	photos: 'photos',
	mentions: 'mentions'
} as const satisfies Record<string, ContactSection>;

/** The card an old `?tab=` value asked for, or null when it names none. */
export function sectionForLegacyTab(value: string | null): ContactSection | null {
	if (value === null) return null;
	return Object.hasOwn(SECTION_FOR_LEGACY_TAB, value)
		? SECTION_FOR_LEGACY_TAB[value as keyof typeof SECTION_FOR_LEGACY_TAB]
		: null;
}

/**
 * A person's page with the relationship form already open and nobody chosen (docs/02 §2.4) —
 * where every "link them to somebody" invitation leads. `?relate=<id>` names the other end;
 * left empty, it only opens the form.
 */
export function addRelationshipPath(contactId: string): string {
	return contactSectionPath(contactId, 'relationships', 'relate=');
}

/** The query that presets the relationship form's type (`?as=`, a `encodeRelationshipChoice`). */
export const RELATE_AS_PARAM = 'as';

/**
 * The relationship form on a person's page with the type preset to *Child of*, so whoever is
 * picked or created becomes their parent — where the family tree's slot for a missing parent
 * leads (docs/02 §2.7).
 */
export function addParentPath(contactId: string): string {
	const childOf = encodeRelationshipChoice(PARENT_CHILD_TYPE_KEY, 'reverse');
	return contactSectionPath(contactId, 'relationships', `relate=&${RELATE_AS_PARAM}=${childOf}`);
}
